"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerId } from "@/lib/game/types";
import { lobbyApi } from "@/lib/net/client";
import type { VoiceSignal } from "@/lib/net/voice";

export type VoicePresence = {
  muted: boolean;
  talking: boolean;
};


/**
 * Голос за столом: браузеры соединяются напрямую.
 * Младшее место само предлагает соединение, старшее отвечает.
 */
export function useTableVoice(
  code: string,
  token: string,
  mySeat: PlayerId,
  others: PlayerId[],
) {
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState<
    Partial<Record<PlayerId, VoicePresence>>
  >({});
  const [remoteStreams, setRemoteStreams] = useState<
    Partial<Record<PlayerId, MediaStream>>
  >({});

  const micOnRef = useRef(false);
  const othersRef = useRef(others);
  useEffect(() => {
    othersRef.current = others;
  }, [others]);
  const pcs = useRef(new Map<PlayerId, RTCPeerConnection>());
  const pendingIce = useRef(new Map<PlayerId, RTCIceCandidateInit[]>());
  const localStream = useRef<MediaStream | null>(null);
  const iceServers = useRef<RTCIceServer[] | null>(null);
  const after = useRef(0);

  const send = useCallback(
    (signal: VoiceSignal) => {
      lobbyApi.postVoice(code, token, signal).catch(() => {});
    },
    [code, token],
  );

  const closeAll = useCallback(() => {
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    pendingIce.current.clear();
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    setRemoteStreams({});
  }, []);

  const makePc = useCallback(
    (remote: PlayerId) => {
      const existing = pcs.current.get(remote);
      if (existing && existing.connectionState !== "closed") return existing;
      const pc = new RTCPeerConnection({
        iceServers: iceServers.current ?? [],
      });
      pcs.current.set(remote, pc);
      for (const track of localStream.current?.getTracks() ?? []) {
        pc.addTrack(track, localStream.current as MediaStream);
      }
      pc.onicecandidate = (event) => {
        send({
          kind: "ice",
          to: remote,
          candidate: event.candidate ? event.candidate.toJSON() : null,
        });
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        setRemoteStreams((prev) => ({ ...prev, [remote]: stream }));
      };
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[remote];
            return next;
          });
        }
      };
      return pc;
    },
    [send],
  );

  const flushIce = useCallback(async (remote: PlayerId) => {
    const pc = pcs.current.get(remote);
    const queued = pendingIce.current.get(remote) ?? [];
    pendingIce.current.delete(remote);
    if (!pc) return;
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }, []);

  const offerTo = useCallback(
    async (remote: PlayerId) => {
      const current = pcs.current.get(remote);
      if (
        current &&
        current.connectionState !== "failed" &&
        current.connectionState !== "closed" &&
        (current.currentRemoteDescription ||
          current.signalingState === "have-local-offer")
      ) {
        return;
      }
      if (current) {
        current.close();
        pcs.current.delete(remote);
      }
      const pc = makePc(remote);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ kind: "offer", to: remote, sdp: offer.sdp ?? "" });
    },
    [makePc, send],
  );

  const onSignal = useCallback(
    async (from: PlayerId, signal: VoiceSignal) => {
      if (signal.kind === "mute" || signal.kind === "talk") {
        setPresence((prev) => ({
          ...prev,
          [from]: {
            muted:
              signal.kind === "mute" ? signal.muted : (prev[from]?.muted ?? true),
            talking:
              signal.kind === "talk"
                ? signal.talking
                : (prev[from]?.talking ?? false),
          },
        }));
        return;
      }
      if (!micOnRef.current || signal.to !== mySeat) return;
      if (signal.kind === "ice") {
        const pc = pcs.current.get(from);
        if (!pc || !pc.remoteDescription) {
          if (signal.candidate) {
            const queued = pendingIce.current.get(from) ?? [];
            queued.push(signal.candidate);
            pendingIce.current.set(from, queued);
          }
          return;
        }
        if (signal.candidate) {
          await pc.addIceCandidate(signal.candidate).catch(() => {});
        }
        return;
      }
      if (signal.kind === "offer") {
        if (mySeat < from) return;
        const existing = pcs.current.get(from);
        if (existing) {
          existing.close();
          pcs.current.delete(from);
        }
        const pc = makePc(from);
        await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushIce(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ kind: "answer", to: from, sdp: answer.sdp ?? "" });
        return;
      }
      const pc = pcs.current.get(from);
      if (!pc) return;
      await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      await flushIce(from);
    },
    [flushIce, makePc, mySeat, send],
  );

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      while (!stopped) {
        try {
          const reply = await lobbyApi.pullVoice(code, token, after.current);
          for (const item of reply.signals) {
            after.current = Math.max(after.current, item.id);
            await onSignal(item.from, item.signal);
          }
        } catch {
          // связь с лобби моргнула — следующая попытка подберёт сигналы
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [code, onSignal, token]);

  useEffect(() => {
    if (!micOn) return;
    const timer = setInterval(() => {
      for (const remote of othersRef.current) {
        if (mySeat < remote) void offerTo(remote).catch(() => {});
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [micOn, mySeat, offerTo]);

  useEffect(() => {
    const stream = localStream.current;
    if (!micOn || !stream) return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let last = false;
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const talking = Math.sqrt(sum / samples.length) > 0.04;
      if (talking !== last) {
        last = talking;
        setPresence((prev) => ({
          ...prev,
          [mySeat]: { muted: false, talking },
        }));
        send({ kind: "talk", talking });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      void context.close();
    };
  }, [micOn, mySeat, send]);

  const toggle = useCallback(async () => {
    setError(null);
    if (micOnRef.current) {
      micOnRef.current = false;
      setMicOn(false);
      setPresence((prev) => ({
        ...prev,
        [mySeat]: { muted: true, talking: false },
      }));
      send({ kind: "mute", muted: true });
      send({ kind: "talk", talking: false });
      closeAll();
      return;
    }
    try {
      iceServers.current = (await lobbyApi.ice(code, token)).iceServers;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStream.current = stream;
      micOnRef.current = true;
      setMicOn(true);
      setPresence((prev) => ({
        ...prev,
        [mySeat]: { muted: false, talking: false },
      }));
      send({ kind: "mute", muted: false });
      for (const remote of othersRef.current) {
        if (mySeat < remote) await offerTo(remote);
        else makePc(remote);
      }
    } catch {
      closeAll();
      micOnRef.current = false;
      setMicOn(false);
      setError("Браузер не дал микрофон. Разрешите его для этого сайта.");
    }
  }, [closeAll, code, makePc, mySeat, offerTo, send, token]);

  useEffect(() => closeAll, [closeAll]);

  return { micOn, error, presence, remoteStreams, toggle };
}

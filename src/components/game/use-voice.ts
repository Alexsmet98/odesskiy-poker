"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerId } from "@/lib/game/types";
import { lobbyApi } from "@/lib/net/client";
import type { VoiceSignal } from "@/lib/net/voice";
import { TablePeer, watchTalking } from "./table-peer";

export type VoicePresence = {
  muted: boolean;
  talking: boolean;
};

const POLL_MS = 120;
const STUN: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };
const CHANNEL_ERROR =
  "Прямой звук не дошёл. Без TURN на сервере из разных сетей друг друга не слышно.";

/**
 * Голос за столом идёт WebRTC напрямую между браузерами, кодеком Opus.
 * Сервер только передаёт приглашение. Кольцо «говорит» загорается,
 * когда звук этого игрока реально пришёл.
 */
export function useTableVoice(
  code: string,
  token: string,
  mySeat: PlayerId,
  others: PlayerId[],
) {
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [presence, setPresence] = useState<
    Partial<Record<PlayerId, VoicePresence>>
  >({});

  const micOnRef = useRef(false);
  const othersRef = useRef(others);
  const peersRef = useRef<Map<PlayerId, TablePeer>>(new Map());
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopLevel = useRef<(() => void) | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const downSeats = useRef(new Set<PlayerId>());

  useEffect(() => {
    othersRef.current = others;
  }, [others]);

  const context = useCallback(() => {
    if (!audioContext.current || audioContext.current.state === "closed") {
      audioContext.current = new AudioContext();
    }
    void audioContext.current.resume();
    return audioContext.current;
  }, []);

  const send = useCallback(
    (signal: VoiceSignal) => {
      lobbyApi.postVoice(code, token, signal).catch(() => {});
    },
    [code, token],
  );

  const stopMic = useCallback(() => {
    stopLevel.current?.();
    stopLevel.current = null;
    const track = trackRef.current;
    trackRef.current = null;
    track?.stop();
    for (const peer of peersRef.current.values()) void peer.setMic(null);
  }, []);

  useEffect(() => {
    let stopped = false;
    const peers = new Map<PlayerId, TablePeer>();
    peersRef.current = peers;
    downSeats.current = new Set();
    let after = 0;
    let iceServers: RTCIceServer[] = [STUN];

    const reportDown = (seat: PlayerId, down: boolean) => {
      if (down) downSeats.current.add(seat);
      else downSeats.current.delete(seat);
      setChannelError(downSeats.current.size > 0 ? CHANNEL_ERROR : null);
    };

    const forgetSeat = (seat: PlayerId) => {
      setPresence((prev) => {
        if (!prev[seat]) return prev;
        const next = { ...prev };
        delete next[seat];
        return next;
      });
    };

    const ensure = (seat: PlayerId) => {
      if (seat === mySeat || peers.has(seat)) return;
      const peer = new TablePeer(seat, mySeat, iceServers, {
        send,
        audioContext: context,
        onTalking: (talking) => {
          setPresence((prev) => ({
            ...prev,
            [seat]: { muted: prev[seat]?.muted ?? false, talking },
          }));
        },
        onDown: (down) => reportDown(seat, down),
      });
      peers.set(seat, peer);
      if (trackRef.current) void peer.setMic(trackRef.current);
    };

    const syncPeers = () => {
      const wanted = new Set(othersRef.current);
      for (const seat of [...peers.keys()]) {
        if (wanted.has(seat)) continue;
        peers.get(seat)?.close();
        peers.delete(seat);
        reportDown(seat, false);
        forgetSeat(seat);
      }
      for (const seat of wanted) ensure(seat);
    };

    const onSignal = (from: PlayerId, signal: VoiceSignal) => {
      if (signal.kind === "talk") return;
      if (signal.kind === "mute") {
        setPresence((prev) => ({
          ...prev,
          [from]: {
            muted: signal.muted,
            talking: signal.muted ? false : (prev[from]?.talking ?? false),
          },
        }));
        return;
      }
      if (signal.to !== mySeat) return;
      ensure(from);
      peers.get(from)?.accept(signal);
    };

    const poll = async () => {
      try {
        const ice = await lobbyApi.ice(code, token);
        if (!stopped && ice.iceServers.length > 0) iceServers = ice.iceServers;
      } catch {
        // без ответа сервера остаётся публичный STUN
      }
      if (stopped) return;
      try {
        const backlog = await lobbyApi.pullVoice(code, token, 0);
        if (stopped) return;
        for (const item of backlog.signals) {
          after = Math.max(after, item.id);
          if (item.signal.kind === "mute") onSignal(item.from, item.signal);
        }
      } catch {
        // первый живой опрос начнётся ниже
      }
      if (stopped) return;
      syncPeers();
      while (!stopped) {
        try {
          const batch = await lobbyApi.pullVoice(code, token, after);
          if (stopped) return;
          for (const item of batch.signals) {
            after = Math.max(after, item.id);
            onSignal(item.from, item.signal);
          }
          syncPeers();
        } catch {
          // следующая попытка подберёт приглашение
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    };
    void poll();

    const resume = () => {
      void audioContext.current?.resume();
      for (const peer of peers.values()) peer.resumePlayback();
    };
    window.addEventListener("pointerdown", resume);

    return () => {
      stopped = true;
      window.removeEventListener("pointerdown", resume);
      for (const peer of peers.values()) peer.close();
      peers.clear();
      if (peersRef.current === peers) peersRef.current = new Map();
    };
  }, [code, context, mySeat, send, token]);

  const toggle = useCallback(async () => {
    setError(null);
    if (micOnRef.current) {
      micOnRef.current = false;
      setMicOn(false);
      stopMic();
      setPresence((prev) => ({
        ...prev,
        [mySeat]: { muted: true, talking: false },
      }));
      send({ kind: "mute", muted: true });
      return;
    }
    if (othersRef.current.length === 0) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("Нет дорожки микрофона");
      trackRef.current = track;
      stopLevel.current = watchTalking(stream, context, (talking) => {
        if (!micOnRef.current) return;
        setPresence((prev) => ({
          ...prev,
          [mySeat]: { muted: false, talking },
        }));
      });
      await Promise.all(
        [...peersRef.current.values()].map((peer) => peer.setMic(track)),
      );
      micOnRef.current = true;
      setMicOn(true);
      setPresence((prev) => ({
        ...prev,
        [mySeat]: { muted: false, talking: false },
      }));
      send({ kind: "mute", muted: false });
      for (const peer of peersRef.current.values()) peer.resumePlayback();
    } catch {
      stopMic();
      micOnRef.current = false;
      setMicOn(false);
      setError("Браузер не дал микрофон. Разрешите его для этого сайта.");
    }
  }, [context, mySeat, send, stopMic]);

  useEffect(
    () => () => {
      stopMic();
      void audioContext.current?.close();
    },
    [stopMic],
  );

  return { micOn, error, channelError, presence, toggle };
}

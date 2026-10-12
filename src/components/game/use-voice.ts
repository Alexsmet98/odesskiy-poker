"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerId } from "@/lib/game/types";
import { lobbyApi } from "@/lib/net/client";
import type { VoiceSignal } from "@/lib/net/voice";
import {
  DISCONNECT_GRACE_MS,
  afterFailure,
  afterGrace,
  afterStall,
  describeMicError,
  freshRecovery,
  iceRetryDelay,
  stallDelay,
  type Recovery,
  type RecoveryStep,
} from "@/lib/net/voice-recovery";
import {
  emptyMeasure,
  formatVoiceDiagnostics,
  iceListHasTurn,
  type VoiceMeasure,
} from "@/lib/net/voice-stats";
import { TablePeer, watchTalking } from "./table-peer";

export type VoicePresence = {
  muted: boolean;
  talking: boolean;
};

const POLL_MS = 120;
const STATS_MS = 2_000;
const CONNECTING_SPINS = 4;
const STUN: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };

type TimerBag = {
  grace?: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
  watch?: ReturnType<typeof setTimeout>;
  stall?: ReturnType<typeof setTimeout>;
  spins: number;
};

type VoiceActions = {
  enablePlayback: () => void;
  reconnect: () => void;
  copyDiagnostics: () => Promise<string>;
};

/**
 * Голос за столом идёт WebRTC напрямую между браузерами, кодеком Opus.
 * Обрыв сначала пережидается, затем restartIce, затем новое соединение
 * через 2, 5 и 10 секунд. Дальше остаётся кнопка «Переподключить звук».
 */
export function useTableVoice(
  code: string,
  token: string,
  mySeat: PlayerId,
  others: PlayerId[],
  names: Partial<Record<PlayerId, string>>,
) {
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [linkLost, setLinkLost] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [presence, setPresence] = useState<
    Partial<Record<PlayerId, VoicePresence>>
  >({});

  const micOnRef = useRef(false);
  const micDeniedRef = useRef(false);
  const playbackRef = useRef(false);
  const othersRef = useRef(others);
  const namesRef = useRef(names);
  const peersRef = useRef<Map<PlayerId, TablePeer>>(new Map());
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopLevel = useRef<(() => void) | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const downSeats = useRef(new Set<PlayerId>());
  const blockedSeats = useRef(new Set<PlayerId>());
  const actions = useRef<VoiceActions>({
    enablePlayback: () => {},
    reconnect: () => {},
    copyDiagnostics: async () => "",
  });
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    othersRef.current = others;
  }, [others]);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

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
    blockedSeats.current = new Set();
    const recoveries = new Map<PlayerId, Recovery>();
    const timers = new Map<PlayerId, TimerBag>();
    const measures = new Map<PlayerId, VoiceMeasure & { state: string }>();
    let after = 0;
    let iceServers: RTCIceServer[] = [STUN];
    let iceOk = false;
    let iceTimer: ReturnType<typeof setTimeout> | null = null;
    let turnConfigured = false;
    let applying = false;

    const bagFor = (seat: PlayerId): TimerBag => {
      const existing = timers.get(seat);
      if (existing) return existing;
      const created: TimerBag = { spins: 0 };
      timers.set(seat, created);
      return created;
    };

    const clearBag = (seat: PlayerId) => {
      const bag = timers.get(seat);
      if (!bag) return;
      if (bag.grace) clearTimeout(bag.grace);
      if (bag.retry) clearTimeout(bag.retry);
      if (bag.watch) clearTimeout(bag.watch);
      if (bag.stall) clearTimeout(bag.stall);
      bag.grace = undefined;
      bag.retry = undefined;
      bag.watch = undefined;
      bag.stall = undefined;
      bag.spins = 0;
    };

    const reportDown = (seat: PlayerId, down: boolean) => {
      if (down) downSeats.current.add(seat);
      else downSeats.current.delete(seat);
      setLinkLost(downSeats.current.size > 0);
    };

    const reportBlocked = (seat: PlayerId, blocked: boolean) => {
      if (blocked) blockedSeats.current.add(seat);
      else blockedSeats.current.delete(seat);
      const next = blockedSeats.current.size > 0;
      playbackRef.current = next;
      setPlaybackBlocked(next);
    };

    const forgetSeat = (seat: PlayerId) => {
      setPresence((prev) => {
        if (!prev[seat]) return prev;
        const next = { ...prev };
        delete next[seat];
        return next;
      });
    };

    const recoveryOf = (seat: PlayerId): Recovery =>
      recoveries.get(seat) ?? freshRecovery();

    const createPeer = (seat: PlayerId): TablePeer => {
      const peer = new TablePeer(seat, mySeat, iceServers, {
        send,
        audioContext: context,
        onTalking: (talking) => {
          setPresence((prev) => ({
            ...prev,
            [seat]: { muted: prev[seat]?.muted ?? false, talking },
          }));
        },
        onPlaybackBlocked: (blocked) => reportBlocked(seat, blocked),
        onState: (state) => onState(seat, state),
      });
      peers.set(seat, peer);
      if (trackRef.current) void peer.setMic(trackRef.current);
      armStall(seat);
      armWatch(seat);
      return peer;
    };

    const replacePeer = (seat: PlayerId) => {
      peers.get(seat)?.close();
      peers.delete(seat);
      measures.delete(seat);
      createPeer(seat);
    };

    const applyStep = (seat: PlayerId, step: RecoveryStep) => {
      recoveries.set(seat, step.recovery);
      const bag = bagFor(seat);
      if (bag.grace) clearTimeout(bag.grace);
      if (bag.retry) clearTimeout(bag.retry);
      if (bag.watch) clearTimeout(bag.watch);
      if (bag.stall) clearTimeout(bag.stall);
      bag.grace = undefined;
      bag.retry = undefined;
      bag.watch = undefined;
      bag.stall = undefined;
      if (step.kind === "give-up") {
        reportDown(seat, true);
        return;
      }
      const run = () => {
        if (stopped) return;
        const peer = peers.get(seat);
        if (!peer || peer.isConnected()) return;
        applying = true;
        try {
          if (step.kind === "recreate" || step.kind === "recreate-now") {
            replacePeer(seat);
            return;
          }
          peer.restartIce();
        } finally {
          applying = false;
        }
        if (peers.get(seat)?.isConnected() || bagFor(seat).retry) return;
        armWatch(seat);
      };
      if (step.kind === "restart-now" || step.kind === "recreate-now") {
        run();
        return;
      }
      bag.retry = setTimeout(() => {
        bag.retry = undefined;
        run();
      }, step.delayMs);
    };

    const armWatch = (seat: PlayerId) => {
      const bag = bagFor(seat);
      if (recoveryOf(seat).gaveUp || bag.retry) return;
      if (bag.watch) clearTimeout(bag.watch);
      const timer = setTimeout(() => {
        if (bag.watch !== timer) return;
        bag.watch = undefined;
        if (stopped || bag.retry) return;
        const peer = peers.get(seat);
        const state = peer?.linkState();
        if (!peer || state === "connected" || state === "closed") return;
        if (state === "new" && bag.stall) {
          armWatch(seat);
          return;
        }
        if (bag.stall) {
          clearTimeout(bag.stall);
          bag.stall = undefined;
        }
        if (state === "new") {
          applyStep(seat, afterStall(recoveryOf(seat)));
          return;
        }
        if (state === "connecting" && bag.spins < CONNECTING_SPINS) {
          bag.spins += 1;
          armWatch(seat);
          return;
        }
        bag.spins = 0;
        applyStep(seat, afterFailure(recoveryOf(seat)));
      }, DISCONNECT_GRACE_MS);
      bag.watch = timer;
    };

    /** Пока канал остаётся new, ждёт 2, 5 и 10 секунд и затем просит кнопку. */
    const armStall = (seat: PlayerId) => {
      const recovery = recoveryOf(seat);
      if (recovery.gaveUp) return;
      const delay = stallDelay(recovery);
      if (delay === null) {
        applyStep(seat, afterStall(recovery));
        return;
      }
      const bag = bagFor(seat);
      if (bag.retry || bag.grace || bag.stall) return;
      const timer = setTimeout(() => {
        if (bag.stall !== timer) return;
        bag.stall = undefined;
        if (stopped || !peers.has(seat)) return;
        const state = peers.get(seat)?.linkState();
        if (state === "connected" || state === "closed" || state === "connecting") return;
        if (state === "disconnected" || state === "failed") return;
        if (bag.watch) {
          clearTimeout(bag.watch);
          bag.watch = undefined;
        }
        applyStep(seat, afterStall(recoveryOf(seat)));
      }, delay);
      bag.stall = timer;
    };

    const onState = (seat: PlayerId, state: RTCPeerConnectionState) => {
      if (stopped) return;
      if (state === "connected") {
        clearBag(seat);
        recoveries.set(seat, freshRecovery());
        reportDown(seat, false);
        return;
      }
      if (applying) return;
      const recovery = recoveryOf(seat);
      if (recovery.gaveUp) return;
      const bag = bagFor(seat);
      if (state === "disconnected") {
        if (bag.grace || bag.retry) return;
        if (bag.watch) {
          clearTimeout(bag.watch);
          bag.watch = undefined;
        }
        if (bag.stall) {
          clearTimeout(bag.stall);
          bag.stall = undefined;
        }
        bag.grace = setTimeout(() => {
          bag.grace = undefined;
          if (!peers.has(seat)) return;
          const current = peers.get(seat)?.linkState();
          if (current === "connected" || current === "connecting") return;
          if (current === "new") {
            applyStep(seat, afterStall(recoveryOf(seat)));
            return;
          }
          applyStep(seat, afterGrace(recoveryOf(seat)));
        }, DISCONNECT_GRACE_MS);
        return;
      }
      if (state !== "failed") return;
      if (bag.grace) clearTimeout(bag.grace);
      bag.grace = undefined;
      if (bag.watch) clearTimeout(bag.watch);
      bag.watch = undefined;
      if (bag.stall) clearTimeout(bag.stall);
      bag.stall = undefined;
      if (bag.retry) return;
      applyStep(seat, afterFailure(recoveryOf(seat)));
    };

    const ensure = (seat: PlayerId) => {
      if (seat === mySeat || peers.has(seat)) return;
      createPeer(seat);
    };

    const syncPeers = () => {
      const wanted = new Set(othersRef.current);
      for (const seat of [...peers.keys()]) {
        if (wanted.has(seat)) continue;
        clearBag(seat);
        recoveries.delete(seat);
        peers.get(seat)?.close();
        peers.delete(seat);
        measures.delete(seat);
        reportDown(seat, false);
        reportBlocked(seat, false);
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

    const applyIce = (servers: RTCIceServer[]) => {
      iceServers = servers.length > 0 ? servers : [STUN];
      turnConfigured = iceListHasTurn(iceServers);
      iceOk = true;
      for (const peer of peers.values()) {
        if (peer.isConnected()) continue;
        peer.setIceServers(iceServers);
        peer.restartIce();
      }
    };

    const loadIce = (attempt: number) => {
      if (stopped) return;
      lobbyApi
        .ice(code, token)
        .then((ice) => {
          if (stopped) return;
          applyIce(ice.iceServers);
        })
        .catch(() => {
          if (stopped) return;
          iceOk = false;
          iceTimer = setTimeout(() => loadIce(attempt + 1), iceRetryDelay(attempt));
        });
    };

    const pullStats = async () => {
      await Promise.all(
        [...peers.entries()].map(async ([seat, peer]) => {
          measures.set(seat, await peer.snapshot());
        }),
      );
    };

    actions.current = {
      enablePlayback: () => {
        void context().resume();
        for (const peer of peers.values()) void peer.resumePlayback();
      },
      reconnect: () => {
        if (!iceOk) {
          if (iceTimer) clearTimeout(iceTimer);
          iceTimer = null;
          loadIce(0);
        }
        for (const seat of [...peers.keys()]) {
          if (!recoveryOf(seat).gaveUp && peers.get(seat)?.isConnected()) continue;
          clearBag(seat);
          recoveries.set(seat, freshRecovery());
          reportDown(seat, false);
          replacePeer(seat);
        }
      },
      copyDiagnostics: async () => {
        await pullStats();
        return formatVoiceDiagnostics({
          at: new Date(),
          turnConfigured,
          mic: micDeniedRef.current ? "denied" : micOnRef.current ? "on" : "off",
          playback: playbackRef.current ? "blocked" : "ok",
          links: [...peers.keys()].map((seat) => {
            const measure = measures.get(seat) ?? { ...emptyMeasure(), state: "new" };
            return {
              name: namesRef.current[seat] ?? `Игрок ${seat + 1}`,
              seat,
              state: measure.state,
              rttMs: measure.rttMs,
              lossPct: measure.lossPct,
              jitterMs: measure.jitterMs,
              route: measure.route,
            };
          }),
        });
      },
    };

    loadIce(0);

    const poll = async () => {
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
    const statsTimer = setInterval(() => {
      void pullStats();
    }, STATS_MS);

    const resume = () => {
      void audioContext.current?.resume();
      for (const peer of peers.values()) void peer.resumePlayback();
    };
    window.addEventListener("pointerdown", resume);

    return () => {
      stopped = true;
      if (iceTimer) clearTimeout(iceTimer);
      clearInterval(statsTimer);
      window.removeEventListener("pointerdown", resume);
      for (const seat of timers.keys()) clearBag(seat);
      for (const peer of peers.values()) peer.close();
      peers.clear();
      if (peersRef.current === peers) peersRef.current = new Map();
      actions.current = {
        enablePlayback: () => {},
        reconnect: () => {},
        copyDiagnostics: async () => "",
      };
    };
  }, [code, context, mySeat, send, token]);

  const toggle = useCallback(async () => {
    setMicError(null);
    micDeniedRef.current = false;
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
      for (const peer of peersRef.current.values()) void peer.resumePlayback();
    } catch (error) {
      stopMic();
      micOnRef.current = false;
      setMicOn(false);
      const described = describeMicError(error);
      micDeniedRef.current = described.denied;
      setMicError(described.text);
    }
  }, [context, mySeat, send, stopMic]);

  const enablePlayback = useCallback(() => {
    actions.current.enablePlayback();
  }, []);

  const reconnect = useCallback(() => {
    actions.current.reconnect();
  }, []);

  const copyDiagnostics = useCallback(async () => {
    try {
      const text = await actions.current.copyDiagnostics();
      if (!text) throw new Error("пусто");
      await writeClipboard(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2_000);
  }, []);

  useEffect(
    () => () => {
      stopMic();
      if (copyTimer.current) clearTimeout(copyTimer.current);
      void audioContext.current?.close();
    },
    [stopMic],
  );

  return {
    micOn,
    micError,
    playbackBlocked,
    linkLost,
    copyState,
    presence,
    toggle,
    enablePlayback,
    reconnect,
    copyDiagnostics,
  };
}

async function writeClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // ниже запасной путь, если браузер не отдал буфер
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Не удалось скопировать");
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerId } from "@/lib/game/types";
import { lobbyApi } from "@/lib/net/client";
import type { VoiceSignal } from "@/lib/net/voice";

export type VoicePresence = {
  muted: boolean;
  talking: boolean;
};

const SAMPLE_RATE = 16_000;
/** Сколько сэмплов копить перед отправкой: 100 мс. */
const FRAME = 1600;

/**
 * Голос за столом идёт через сервер лобби, а не напрямую между браузерами.
 * Индикатор «говорит» и сам звук поэтому доходят одним и тем же путём.
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

  const micOnRef = useRef(false);
  const othersRef = useRef(others);
  useEffect(() => {
    othersRef.current = others;
  }, [others]);
  const playCtx = useRef<AudioContext | null>(null);
  const capture = useRef<{ stop: () => void } | null>(null);
  const playAt = useRef(new Map<number, number>());

  const send = useCallback(
    (signal: VoiceSignal) => {
      lobbyApi.postVoice(code, token, signal).catch(() => {});
    },
    [code, token],
  );

  const stopCapture = useCallback(() => {
    capture.current?.stop();
    capture.current = null;
  }, []);

  const playFrame = useCallback((from: number, bytes: Uint8Array) => {
    const ctx = playCtx.current;
    if (!ctx || bytes.length < 2) return;
    const samples = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2),
    );
    const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    let when = playAt.current.get(from) ?? 0;
    if (when < now + 0.02 || when > now + 0.45) when = now + 0.08;
    source.start(when);
    playAt.current.set(from, when + buffer.duration);
  }, []);

  useEffect(() => {
    let stopped = false;
    let afterSignal = 0;
    let afterAudio = 0;
    const poll = async () => {
      while (!stopped) {
        try {
          const signals = await lobbyApi.pullVoice(code, token, afterSignal);
          for (const item of signals.signals) {
            afterSignal = Math.max(afterSignal, item.id);
            if (item.signal.kind !== "mute" && item.signal.kind !== "talk") continue;
            setPresence((prev) => ({
              ...prev,
              [item.from]: {
                muted:
                  item.signal.kind === "mute"
                    ? item.signal.muted
                    : (prev[item.from]?.muted ?? true),
                talking:
                  item.signal.kind === "talk"
                    ? item.signal.talking
                    : (prev[item.from]?.talking ?? false),
              },
            }));
          }
          if (micOnRef.current || playCtx.current) {
            const audio = await lobbyApi.pullAudio(code, token, afterAudio);
            for (const frame of audio.frames) {
              afterAudio = Math.max(afterAudio, frame.id);
              const binary = Uint8Array.from(atob(frame.pcm), (char) =>
                char.charCodeAt(0),
              );
              playFrame(frame.from, binary);
            }
          }
        } catch {
          // следующая попытка подберёт звук
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [code, playFrame, token]);

  const toggle = useCallback(async () => {
    setError(null);
    if (micOnRef.current) {
      micOnRef.current = false;
      setMicOn(false);
      stopCapture();
      setPresence((prev) => ({
        ...prev,
        [mySeat]: { muted: true, talking: false },
      }));
      send({ kind: "mute", muted: true });
      send({ kind: "talk", talking: false });
      return;
    }
    if (othersRef.current.length === 0) return;
    try {
      const ctx = playCtx.current ?? new AudioContext();
      playCtx.current = ctx;
      await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(ctx.destination);

      let pending = new Int16Array(0);
      let speaking = false;
      processor.onaudioprocess = (event) => {
        if (!micOnRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        const chunk = downsample(input, ctx.sampleRate, SAMPLE_RATE);
        const merged = new Int16Array(pending.length + chunk.length);
        merged.set(pending);
        merged.set(chunk, pending.length);
        let offset = 0;
        while (merged.length - offset >= FRAME) {
          const frame = merged.subarray(offset, offset + FRAME);
          offset += FRAME;
          const copy = new Int16Array(frame);
          void lobbyApi
            .postAudio(code, token, copy.buffer.slice(0) as ArrayBuffer)
            .catch(() => {});
          let energy = 0;
          for (const sample of frame) energy += sample * sample;
          const talking = Math.sqrt(energy / frame.length) / 32768 > 0.04;
          if (talking !== speaking) {
            speaking = talking;
            setPresence((prev) => ({
              ...prev,
              [mySeat]: { muted: false, talking },
            }));
            send({ kind: "talk", talking });
          }
        }
        pending = merged.subarray(offset);
      };

      capture.current = {
        stop: () => {
          processor.onaudioprocess = null;
          processor.disconnect();
          source.disconnect();
          sink.disconnect();
          stream.getTracks().forEach((track) => track.stop());
        },
      };
      micOnRef.current = true;
      setMicOn(true);
      setPresence((prev) => ({
        ...prev,
        [mySeat]: { muted: false, talking: false },
      }));
      send({ kind: "mute", muted: false });
    } catch {
      stopCapture();
      micOnRef.current = false;
      setMicOn(false);
      setError("Браузер не дал микрофон. Разрешите его для этого сайта.");
    }
  }, [code, mySeat, send, stopCapture, token]);

  useEffect(
    () => () => {
      stopCapture();
      void playCtx.current?.close();
    },
    [stopCapture],
  );

  return { micOn, error, presence, toggle };
}

function downsample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate) return floatToPcm(input);
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const mix = input[left] * (1 - (pos - left)) + input[right] * (pos - left);
    out[i] = toInt16(mix);
  }
  return out;
}

function floatToPcm(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = toInt16(input[i]);
  return out;
}

function toInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

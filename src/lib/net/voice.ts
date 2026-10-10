import type { PlayerId } from "@/lib/game/types";

/** Описание WebRTC-соединения. Сам звук между браузерами, не через сервер. */
export type VoiceSignal =
  | { kind: "offer"; to: PlayerId; sdp: string }
  | { kind: "answer"; to: PlayerId; sdp: string }
  | { kind: "ice"; to: PlayerId; candidate: RTCIceCandidateInit | null }
  | { kind: "mute"; muted: boolean }
  | { kind: "talk"; talking: boolean };

export type VoiceItem = {
  id: number;
  from: PlayerId;
  signal: VoiceSignal;
};

const SDP_LIMIT = 20_000;

function isSeat(value: unknown): value is PlayerId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function sdp(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > SDP_LIMIT) {
    throw new Error("Пустое описание соединения");
  }
  return value;
}

function candidate(value: unknown): RTCIceCandidateInit | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") {
    throw new Error("Непонятный ICE-кандидат");
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.candidate !== "string" || raw.candidate.length > 2000) {
    throw new Error("Непонятный ICE-кандидат");
  }
  return {
    candidate: raw.candidate,
    sdpMid: typeof raw.sdpMid === "string" ? raw.sdpMid : null,
    sdpMLineIndex:
      typeof raw.sdpMLineIndex === "number" ? raw.sdpMLineIndex : null,
  };
}

/** Разбирает сигнал с клиента. Бросает Error с коротким текстом, если форма кривая. */
export function parseVoiceSignal(raw: unknown): VoiceSignal {
  if (!raw || typeof raw !== "object") throw new Error("Нет голосового сигнала");
  const signal = raw as Record<string, unknown>;
  if (signal.kind === "mute") {
    if (typeof signal.muted !== "boolean") throw new Error("Не сказано, молчит ли игрок");
    return { kind: "mute", muted: signal.muted };
  }
  if (signal.kind === "talk") {
    if (typeof signal.talking !== "boolean") {
      throw new Error("Не сказано, говорит ли игрок");
    }
    return { kind: "talk", talking: signal.talking };
  }
  if (!isSeat(signal.to)) throw new Error("Не указан собеседник");
  if (signal.kind === "offer" || signal.kind === "answer") {
    return { kind: signal.kind, to: signal.to, sdp: sdp(signal.sdp) };
  }
  if (signal.kind === "ice") {
    return { kind: "ice", to: signal.to, candidate: candidate(signal.candidate) };
  }
  throw new Error("Неизвестный голосовой сигнал");
}

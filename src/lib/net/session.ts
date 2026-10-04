import type { PlayerId } from "@/lib/game/types";
import { normalizeCode } from "./protocol";

export type Session = { token: string; seat: PlayerId; name: string };

const NAME_KEY = "odessa-poker:name";
const sessionKey = (code: string) =>
  `odessa-poker:lobby:${normalizeCode(code)}`;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Сессия хранится в sessionStorage: у каждой вкладки свой игрок, обновление страницы его не теряет. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readSessionRaw(code: string): string | null {
  return window.sessionStorage.getItem(sessionKey(code));
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token === "string" && typeof parsed.name === "string") {
      return parsed as Session;
    }
  } catch {
    // повреждённая запись — считаем, что сессии нет
  }
  return null;
}

export function saveSession(code: string, session: Session): void {
  window.sessionStorage.setItem(sessionKey(code), JSON.stringify(session));
  window.localStorage.setItem(NAME_KEY, session.name);
  notify();
}

export function clearSession(code: string): void {
  window.sessionStorage.removeItem(sessionKey(code));
  notify();
}

export function rememberedName(): string {
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

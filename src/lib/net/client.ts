import {
  normalizeCode,
  type JoinResult,
  type LobbyInfo,
  type NetAction,
} from "./protocol";
import type { VoiceItem, VoiceSignal } from "./voice";

async function request<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new Error("Нет связи с сервером");
  }
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) throw new Error(body?.error ?? "Сервер ответил ошибкой");
  return body as T;
}

const lobbyPath = (code: string) =>
  `/api/lobbies/${encodeURIComponent(normalizeCode(code))}`;

export const lobbyApi = {
  create: (name: string) =>
    request<JoinResult>("/api/lobbies", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  info: (code: string) => request<LobbyInfo>(lobbyPath(code)),
  join: (code: string, name: string) =>
    request<JoinResult>(`${lobbyPath(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  start: (code: string, token: string) =>
    request<{ ok: true }>(`${lobbyPath(code)}/start`, {
      method: "POST",
      token,
    }),
  act: (code: string, token: string, action: NetAction) =>
    request<{ ok: true }>(`${lobbyPath(code)}/action`, {
      method: "POST",
      token,
      body: JSON.stringify({ action }),
    }),
  leave: (code: string, token: string) =>
    request<{ ok: true }>(`${lobbyPath(code)}/leave`, {
      method: "POST",
      token,
    }),
  pollUrl: (code: string, token: string, version: number) =>
    `${lobbyPath(code)}/poll?token=${encodeURIComponent(token)}&v=${version}`,
  eventsUrl: (code: string, token: string) =>
    `${lobbyPath(code)}/events?token=${encodeURIComponent(token)}`,
  ice: (code: string, token: string) =>
    request<{ iceServers: RTCIceServer[] }>(`${lobbyPath(code)}/voice/ice`, {
      token,
    }),
  postVoice: (code: string, token: string, signal: VoiceSignal) =>
    request<{ ok: true }>(`${lobbyPath(code)}/voice`, {
      method: "POST",
      token,
      body: JSON.stringify({ signal }),
    }),
  pullVoice: (code: string, token: string, after: number) =>
    request<{ signals: VoiceItem[] }>(
      `${lobbyPath(code)}/voice?after=${after}`,
      { token },
    ),
};

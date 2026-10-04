"use client";

import { useEffect, useState } from "react";
import { lobbyApi } from "@/lib/net/client";
import type { ServerEvent } from "@/lib/net/protocol";

export type ConnectionStatus = "connecting" | "open" | "closed";

/** Если за это время SSE не принёс ни одного события, считаем, что поток режет прокси. */
const SSE_FIRST_EVENT_MS = 4000;
const RETRY_MS = 1500;

type PollReply = { unchanged: true } | { version: number; event: ServerEvent };

/**
 * Подписка на лобби: сервер присылает полный снимок после каждого изменения.
 * Основной канал — SSE; если он не оживает (туннели и прокси буферизуют поток),
 * переходим на long-poll.
 */
export function useLobbyEvents(code: string, token: string) {
  const [event, setEvent] = useState<ServerEvent | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    let stopped = false;
    let source: EventSource | null = null;
    let pollAbort: AbortController | null = null;

    const startPolling = async () => {
      let version = -1;
      pollAbort = new AbortController();
      const { signal } = pollAbort;
      while (!stopped) {
        try {
          const response = await fetch(lobbyApi.pollUrl(code, token, version), {
            signal,
            cache: "no-store",
          });
          if (response.status === 403 || response.status === 404) {
            setStatus("closed");
            return;
          }
          if (!response.ok) throw new Error(String(response.status));
          const reply = (await response.json()) as PollReply;
          if ("unchanged" in reply) continue;
          version = reply.version;
          setEvent(reply.event);
          setStatus("open");
        } catch {
          if (stopped) return;
          setStatus("connecting");
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      }
    };

    const fallBackToPolling = () => {
      source?.close();
      source = null;
      void startPolling();
    };

    source = new EventSource(lobbyApi.eventsUrl(code, token));
    const firstEventTimer = setTimeout(fallBackToPolling, SSE_FIRST_EVENT_MS);
    source.onmessage = (message) => {
      clearTimeout(firstEventTimer);
      setEvent(JSON.parse(message.data) as ServerEvent);
      setStatus("open");
    };
    source.onerror = () => {
      if (!source) return;
      setStatus(
        source.readyState === EventSource.CLOSED ? "closed" : "connecting",
      );
    };

    return () => {
      stopped = true;
      clearTimeout(firstEventTimer);
      source?.close();
      pollAbort?.abort();
    };
  }, [code, token]);

  return { event, status };
}

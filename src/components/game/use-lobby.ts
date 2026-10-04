"use client";

import { useEffect, useState } from "react";
import { lobbyApi } from "@/lib/net/client";
import type { ServerEvent } from "@/lib/net/protocol";

export type ConnectionStatus = "connecting" | "open" | "closed";

/** Подписка на поток событий лобби: сервер присылает полный снимок после каждого изменения. */
export function useLobbyEvents(code: string, token: string) {
  const [event, setEvent] = useState<ServerEvent | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const source = new EventSource(lobbyApi.eventsUrl(code, token));
    source.onmessage = (message) => {
      setEvent(JSON.parse(message.data) as ServerEvent);
      setStatus("open");
    };
    source.onerror = () => {
      setStatus(
        source.readyState === EventSource.CLOSED ? "closed" : "connecting",
      );
    };
    return () => source.close();
  }, [code, token]);

  return { event, status };
}

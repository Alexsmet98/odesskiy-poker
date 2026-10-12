"use client";

import { createContext, useContext, useMemo } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayerId } from "@/lib/game/types";
import type { SeatInfo } from "@/lib/net/protocol";
import { useTableVoice, type VoicePresence } from "./use-voice";

const noteClass =
  "rounded-md border border-destructive/50 bg-black/80 px-2 py-1 text-[11px] text-red-300";

const VoicePresenceContext = createContext<Partial<
  Record<PlayerId, VoicePresence>
> | null>(null);

export function useVoicePresence(playerId: PlayerId): VoicePresence | null {
  return useContext(VoicePresenceContext)?.[playerId] ?? null;
}

export function VoiceSession({
  code,
  token,
  mySeat,
  seats,
  children,
}: {
  code: string;
  token: string;
  mySeat: PlayerId;
  seats: SeatInfo[];
  children: React.ReactNode;
}) {
  const others = useMemo(
    () =>
      seats
        .filter((seat) => seat.kind === "human" && seat.seat !== mySeat)
        .map((seat) => seat.seat),
    [mySeat, seats],
  );
  const names = useMemo(() => {
    const map: Partial<Record<PlayerId, string>> = {};
    for (const seat of seats) {
      if (seat.name) map[seat.seat] = seat.name;
    }
    return map;
  }, [seats]);
  const voice = useTableVoice(code, token, mySeat, others, names);

  return (
    <VoicePresenceContext.Provider value={voice.presence}>
      {children}
      <div className="pointer-events-none fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2">
        {others.length > 0 && (
          <div className="pointer-events-auto flex max-w-64 flex-col items-stretch gap-1">
            {voice.micError && <p className={noteClass}>{voice.micError}</p>}
            {voice.playbackBlocked && (
              <>
                <p className={noteClass}>Воспроизведение заблокировано.</p>
                <Button size="sm" variant="secondary" onClick={voice.enablePlayback}>
                  Включить звук
                </Button>
              </>
            )}
            {voice.linkLost && (
              <>
                <p className={noteClass}>Потеряна связь.</p>
                <Button size="sm" variant="secondary" onClick={voice.reconnect}>
                  Переподключить звук
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void voice.copyDiagnostics()}
            >
              {voice.copyState === "copied"
                ? "Скопировано"
                : voice.copyState === "failed"
                  ? "Не удалось скопировать"
                  : "Скопировать диагностику"}
            </Button>
            <Button
              size="sm"
              variant={voice.micOn ? "default" : "secondary"}
              onClick={() => void voice.toggle()}
            >
              {voice.micOn ? (
                <Mic className="size-3.5" aria-hidden />
              ) : (
                <MicOff className="size-3.5" aria-hidden />
              )}
              {voice.micOn ? "Микрофон включён" : "Включить микрофон"}
            </Button>
          </div>
        )}
      </div>
    </VoicePresenceContext.Provider>
  );
}

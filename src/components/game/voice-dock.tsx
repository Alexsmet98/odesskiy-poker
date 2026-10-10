"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayerId } from "@/lib/game/types";
import type { SeatInfo } from "@/lib/net/protocol";
import { useTableVoice, type VoicePresence } from "./use-voice";

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
  const voice = useTableVoice(code, token, mySeat, others);

  return (
    <VoicePresenceContext.Provider value={voice.presence}>
      {children}
      <div className="pointer-events-none fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2">
        {others.length > 0 && (
          <div className="pointer-events-auto flex flex-col items-end gap-1">
            {voice.error && (
              <p className="max-w-56 rounded-md border border-destructive/50 bg-black/80 px-2 py-1 text-[11px] text-red-300">
                {voice.error}
              </p>
            )}
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
      {others.map((seat) => (
        <RemoteAudio key={seat} stream={voice.remoteStreams[seat]} />
      ))}
    </VoicePresenceContext.Provider>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream ?? null;
    if (stream) void audio.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

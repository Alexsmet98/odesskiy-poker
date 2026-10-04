"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameState } from "@/lib/game/types";

const TONE: Record<string, string> = {
  neutral: "text-muted-foreground",
  bid: "text-amber-200/80",
  trick: "text-foreground/80",
  joker: "text-fuchsia-300/80",
  score: "text-emerald-300/80",
};

const BOTTOM_THRESHOLD_PX = 32;

export function TableLog({ state }: { state: GameState }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const [hasUnread, setHasUnread] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedToBottom.current = true;
    setHasUnread(false);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottom.current = distance <= BOTTOM_THRESHOLD_PX;
    if (pinnedToBottom.current) setHasUnread(false);
  };

  // Прокручиваем только сам журнал, и только если игрок не листал историю вверх.
  useEffect(() => {
    if (pinnedToBottom.current) {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      setHasUnread(true);
    }
  }, [state.log.length]);

  return (
    <div className="relative flex h-72 flex-col rounded-lg border border-white/10 bg-black/50 backdrop-blur lg:sticky lg:top-4 lg:h-[min(32rem,calc(100dvh-2rem))]">
      <div className="border-b border-white/5 px-3 py-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ember/80">
          За столом
        </h2>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="log-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
      >
        <ul className="space-y-1 text-xs">
          {state.log.map((entry) => (
            <li key={entry.id} className={cn("leading-snug", TONE[entry.tone])}>
              <span className="mr-1.5 font-mono text-[10px] text-white/25">
                {entry.row}
              </span>
              {entry.text}
            </li>
          ))}
        </ul>
      </div>
      {hasUnread && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-ember/40 bg-black/80 px-3 py-1 text-[11px] text-ember shadow-lg hover:bg-black"
        >
          <ChevronDown className="size-3" aria-hidden />
          Новые записи
        </button>
      )}
    </div>
  );
}

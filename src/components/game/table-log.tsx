"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { GameState } from "@/lib/game/types";

const TONE: Record<string, string> = {
  neutral: "text-muted-foreground",
  bid: "text-amber-200/80",
  trick: "text-foreground/80",
  joker: "text-fuchsia-300/80",
  score: "text-emerald-300/80",
};

export function TableLog({ state }: { state: GameState }) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [state.log.length]);

  return (
    <div className="flex h-full max-h-[22rem] flex-col rounded-lg border border-white/10 bg-black/50 backdrop-blur lg:max-h-none">
      <div className="border-b border-white/5 px-3 py-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ember/80">
          За столом
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1 text-xs">
          {state.log.map((entry) => (
            <li key={entry.id} className={cn("leading-snug", TONE[entry.tone])}>
              <span className="mr-1.5 font-mono text-[10px] text-white/25">{entry.row}</span>
              {entry.text}
            </li>
          ))}
        </ul>
        <div ref={bottom} />
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import { CardBack } from "./playing-card";
import type { GameState, PlayerId } from "@/lib/game/types";

const AVATARS: Record<PlayerId, string> = {
  0: "🫵",
  1: "🧔",
  2: "💃",
  3: "🎩",
};

export function PlayerSeat({
  state,
  playerId,
  isActive,
  showBid,
  compact,
  className,
}: {
  state: GameState;
  playerId: PlayerId;
  isActive: boolean;
  showBid: boolean;
  compact?: boolean;
  className?: string;
}) {
  const player = state.players[playerId];
  const bid = state.bids[playerId];
  const tricks = state.tricksWon[playerId];
  const isDealer = state.dealer === playerId;
  const cardsLeft = state.hands[playerId].length;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2 backdrop-blur-sm transition-all duration-300",
        isActive
          ? "border-ember/70 bg-ember/10 shadow-[0_0_30px_-8px_var(--ember)]"
          : "border-white/5 bg-black/40",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "grid size-9 place-items-center rounded-full border text-lg",
            isActive ? "border-ember/60 bg-black/60" : "border-white/10 bg-black/50",
          )}
        >
          <span aria-hidden>{AVATARS[playerId]}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-heading text-sm tracking-wide text-foreground">
              {player.name}
            </span>
            {isDealer && (
              <span
                className="rounded-sm border border-ember/50 px-1 text-[9px] font-semibold uppercase text-ember"
                title="Сдающий"
              >
                сдача
              </span>
            )}
          </div>
          {!compact && (
            <p className="truncate text-[10px] text-muted-foreground">{player.tagline}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-muted-foreground">
          заказ{" "}
          <span className="font-mono text-foreground">
            {showBid ? (bid === null ? "—" : bid === 0 ? "пас" : bid) : bid === null ? "—" : "?"}
          </span>
        </span>
        <span className="text-muted-foreground">
          взял <span className="font-mono text-ember">{tricks}</span>
        </span>
      </div>

      {!player.isHuman && cardsLeft > 0 && (
        <div className="flex -space-x-5">
          {Array.from({ length: Math.min(cardsLeft, 9) }).map((_, i) => (
            <CardBack key={i} size="sm" className="shrink-0" />
          ))}
        </div>
      )}
    </div>
  );
}

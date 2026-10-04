"use client";

import { cn } from "@/lib/utils";
import { PlayingCard } from "./playing-card";
import { SUIT_LABEL, SUIT_LABEL_ACCUSATIVE, SUIT_SYMBOL } from "@/lib/game/cards";
import { trickContext } from "@/lib/game/rules";
import type { GameState, JokerDeclaration, Trick } from "@/lib/game/types";

function declarationBadge(declaration: JokerDeclaration): string {
  if (declaration.kind === "response") {
    return declaration.mode === "high" ? "старший козырь" : "младшая карта";
  }
  switch (declaration.mode) {
    case "lead-high":
      return `${SUIT_SYMBOL[declaration.suit]} джокер старший`;
    case "lead-low":
      return `${SUIT_SYMBOL[declaration.suit]} джокер младший`;
    case "demand-highest":
      return `по самым большим ${SUIT_LABEL_ACCUSATIVE[declaration.suit]}`;
    case "dump":
      return declaration.target === "highest"
        ? `слив: старшая ${SUIT_SYMBOL[declaration.suit]}`
        : `слив: младшая ${SUIT_SYMBOL[declaration.suit]}`;
  }
}

export function TableCenter({
  state,
  trick,
  title,
  subtitle,
}: {
  state: GameState;
  trick: Trick | null;
  title: string;
  subtitle?: string;
}) {
  const ctx = trick && trick.plays.length > 0 ? trickContext(trick) : null;

  return (
    <div className="felt-surface relative flex min-h-[15rem] w-full flex-col items-center justify-center gap-3 rounded-[46%_46%_44%_44%/32%] border border-amber-950/60 px-4 py-6 sm:min-h-[17rem]">
      <div className="pointer-events-none absolute inset-0 rounded-[46%_46%_44%_44%/32%] bg-[radial-gradient(ellipse_at_50%_28%,oklch(0.9_0.08_80/0.1),transparent_60%)]" />

      <div className="text-center">
        <p className="font-heading text-sm uppercase tracking-[0.2em] text-amber-200/70">
          {title}
        </p>
        {subtitle && <p className="mt-0.5 text-xs text-amber-100/50">{subtitle}</p>}
      </div>

      {trick && trick.plays.length > 0 ? (
        <div className="flex flex-wrap items-end justify-center gap-2 sm:gap-3">
          {trick.plays.map((play) => (
            <div
              key={play.card.id}
              className="animate-deal-in flex flex-col items-center gap-1"
              style={{ animationDelay: "0ms" }}
            >
              <PlayingCard
                card={play.card}
                size="md"
                highlighted={trick.winner === play.player}
              />
              <span
                className={cn(
                  "max-w-24 truncate text-[10px]",
                  trick.winner === play.player ? "text-ember" : "text-amber-100/55",
                )}
              >
                {state.players[play.player].name}
              </span>
              {play.declaration && (
                <span className="max-w-28 text-center text-[9px] leading-tight text-amber-200/80">
                  {declarationBadge(play.declaration)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-100/35">На столе пусто</p>
      )}

      {ctx && (
        <p className="text-[10px] uppercase tracking-wider text-amber-200/50">
          масть взятки: {SUIT_SYMBOL[ctx.suit]} {SUIT_LABEL[ctx.suit]}
        </p>
      )}
    </div>
  );
}

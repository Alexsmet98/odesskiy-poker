"use client";

import { cn } from "@/lib/utils";
import {
  isJoker,
  RANK_LABEL,
  SUIT_IS_RED,
  SUIT_SYMBOL,
  type Card as GameCard,
} from "@/lib/game/cards";

const SIZES = {
  sm: "h-16 w-11 text-[0.72rem] rounded-[5px]",
  md: "h-24 w-16 text-sm rounded-md",
  lg: "h-32 w-22 text-base rounded-lg",
} as const;

export type CardSize = keyof typeof SIZES;

export function PlayingCard({
  card,
  size = "md",
  className,
  dimmed,
  highlighted,
}: {
  card: GameCard;
  size?: CardSize;
  className?: string;
  dimmed?: boolean;
  highlighted?: boolean;
}) {
  const joker = isJoker(card);

  return (
    <div
      className={cn(
        "relative flex select-none flex-col justify-between overflow-hidden border border-black/25 p-1.5 font-semibold",
        SIZES[size],
        isJoker(card) ? (card.color === "red" ? "joker-face joker-red" : "joker-face joker-black") : "card-face",
        !joker && SUIT_IS_RED[card.suit] ? "text-red-800" : !joker && "text-zinc-900",
        dimmed && "opacity-45 saturate-50",
        highlighted && "ring-2 ring-ember shadow-[0_0_24px_-4px_var(--ember)]",
        className,
      )}
    >
      {isJoker(card) ? (
        <>
          <span className="leading-none tracking-wider">{card.color === "red" ? "К" : "Ч"}</span>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-2xl drop-shadow",
              card.color === "black" && "grayscale brightness-75",
            )}
          >
            🃏
          </span>
          <span className="self-end leading-none tracking-wider">
            {card.color === "red" ? "К" : "Ч"}
          </span>
        </>
      ) : (
        <>
          <span className="leading-none">
            {RANK_LABEL[card.rank]}
            {SUIT_SYMBOL[card.suit]}
          </span>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center opacity-85",
              size === "sm" ? "text-xl" : size === "md" ? "text-3xl" : "text-4xl",
            )}
          >
            {SUIT_SYMBOL[card.suit]}
          </span>
          <span className="self-end leading-none rotate-180">
            {RANK_LABEL[card.rank]}
            {SUIT_SYMBOL[card.suit]}
          </span>
        </>
      )}
    </div>
  );
}

export function CardBack({
  size = "md",
  className,
}: {
  size?: CardSize;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-back border border-black/40",
        SIZES[size],
        className,
      )}
    />
  );
}

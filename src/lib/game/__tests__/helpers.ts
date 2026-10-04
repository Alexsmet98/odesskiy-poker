import { makeCard, type Card, type Rank, type Suit } from "../cards";
import type { JokerDeclaration, Play, PlayerId, Trick } from "../types";

export const c = (suit: Suit, rank: Rank) => makeCard(suit, rank);
export const joker = (index: 0 | 1 = 0): Card => ({
  kind: "joker",
  id: `joker-${index}`,
  index,
});

export function play(
  player: PlayerId,
  card: Card,
  declaration: JokerDeclaration | null = null,
): Play {
  return { player, card, declaration };
}

export function trick(leader: PlayerId, plays: Play[]): Trick {
  return { leader, plays, winner: null };
}

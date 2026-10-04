import {
  cardsOfSuit,
  highestOfSuit,
  isJoker,
  isSuitCard,
  type Card,
  type Suit,
  type SuitCard,
} from "./cards";
import {
  PLAYER_COUNT,
  type Play,
  type PlayerId,
  type PlayRequirement,
  type Trick,
} from "./types";

export function nextPlayer(player: PlayerId): PlayerId {
  return ((player + 1) % PLAYER_COUNT) as PlayerId;
}

/** Первым торгуется и первым заходит игрок слева от сдающего. */
export function firstAfterDealer(dealer: PlayerId): PlayerId {
  return nextPlayer(dealer);
}

/** Порядок торговли: слева от сдающего и далее по кругу, сдающий — последний. */
export function biddingOrder(dealer: PlayerId): PlayerId[] {
  const order: PlayerId[] = [];
  let current = firstAfterDealer(dealer);
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    order.push(current);
    current = nextPlayer(current);
  }
  return order;
}

/**
 * Правило «не сходимся»: сдающий торгуется последним и не может назвать заказ,
 * при котором сумма всех заказов совпадёт с числом карт на руках.
 */
export function legalBids(
  cardsInHand: number,
  bidsSoFar: number[],
  isDealer: boolean,
): number[] {
  const all = Array.from({ length: cardsInHand + 1 }, (_, i) => i);
  if (!isDealer) return all;
  const placed = bidsSoFar.reduce((sum, b) => sum + b, 0);
  return all.filter((bid) => placed + bid !== cardsInHand);
}

export function isLegalBid(
  bid: number,
  cardsInHand: number,
  bidsSoFar: number[],
  isDealer: boolean,
): boolean {
  return legalBids(cardsInHand, bidsSoFar, isDealer).includes(bid);
}

export type TrickContext = {
  leadPlay: Play;
  /** Масть, по которой идёт взятка: масть карты хода либо масть, объявленная джокером. */
  suit: Suit;
  mode: "normal" | "lead-high" | "lead-low" | "demand-highest" | "dump";
  dumpTarget: "highest" | "lowest" | null;
};

export function trickContext(trick: Trick): TrickContext | null {
  const leadPlay = trick.plays[0];
  if (!leadPlay) return null;
  const declaration = leadPlay.declaration;
  if (isSuitCard(leadPlay.card)) {
    return { leadPlay, suit: leadPlay.card.suit, mode: "normal", dumpTarget: null };
  }
  if (!declaration || declaration.kind !== "lead") {
    throw new Error("Заход джокером обязан содержать объявление масти и режима");
  }
  return {
    leadPlay,
    suit: declaration.suit,
    mode: declaration.mode,
    dumpTarget: declaration.mode === "dump" ? declaration.target : null,
  };
}

/** Что обязан положить игрок, отвечающий на текущий ход. */
export function playRequirement(trick: Trick | null): PlayRequirement {
  if (!trick) return { kind: "none" };
  const ctx = trickContext(trick);
  if (!ctx) return { kind: "none" };
  if (ctx.mode === "demand-highest") return { kind: "highest-of", suit: ctx.suit };
  return { kind: "follow", suit: ctx.suit };
}

/**
 * Джокера можно положить в любой момент, даже если есть карта требуемой масти.
 * Остальные карты подчиняются требованию масти; если масти нет — можно любую.
 */
export function legalPlays(hand: Card[], trick: Trick | null): Card[] {
  const requirement = playRequirement(trick);
  const jokers = hand.filter(isJoker);
  if (requirement.kind === "none") return [...hand];

  const sameSuit = cardsOfSuit(hand, requirement.suit);
  if (sameSuit.length === 0) return [...hand];

  if (requirement.kind === "highest-of") {
    const highest = highestOfSuit(hand, requirement.suit) as SuitCard;
    return [highest, ...jokers];
  }
  return [...sameSuit, ...jokers];
}

export function isLegalPlay(card: Card, hand: Card[], trick: Trick | null): boolean {
  return legalPlays(hand, trick).some((c) => c.id === card.id);
}

/** Джокер, объявленный наисильнейшим козырем, бьёт все обычные карты на столе. */
function claimsHighest(play: Play): boolean {
  const d = play.declaration;
  if (!d) return false;
  if (d.kind === "response") return d.mode === "high";
  return d.mode === "lead-high";
}

function extremeOfSuit(
  plays: Play[],
  suit: Suit,
  target: "highest" | "lowest",
): Play | null {
  let best: Play | null = null;
  let bestRank = target === "highest" ? -Infinity : Infinity;
  for (const play of plays) {
    if (!isSuitCard(play.card) || play.card.suit !== suit) continue;
    const better = target === "highest" ? play.card.rank > bestRank : play.card.rank < bestRank;
    if (better) {
      best = play;
      bestRank = play.card.rank;
    }
  }
  return best;
}

/**
 * Взятку забирает старшая карта масти хода, с поправками на джокеров:
 * — джокер «наисильнейший козырь» забирает взятку (если заявлены оба джокера, чёрный всегда сильнее красного);
 * — джокер «самая младшая карта» никогда не берёт;
 * — при заходе джокером «младший», «по самым большим» и «слив» взятку забирает
 *   соответствующая карта названной масти, а если такой масти никто не положил —
 *   взятка остаётся у игрока с джокером.
 */
export function resolveTrick(trick: Trick): PlayerId {
  const ctx = trickContext(trick);
  if (!ctx) throw new Error("Нельзя определить взявшего: во взятке нет карт");

  const highestClaims = trick.plays.filter(claimsHighest);
  if (highestClaims.length > 0) {
    const black = highestClaims.find((p) => isJoker(p.card) && p.card.color === "black");
    return (black ?? highestClaims[0]).player;
  }

  const target = ctx.mode === "dump" ? (ctx.dumpTarget ?? "highest") : "highest";
  const winner = extremeOfSuit(trick.plays, ctx.suit, target);
  return winner ? winner.player : ctx.leadPlay.player;
}

export function isTrickComplete(trick: Trick | null): boolean {
  return trick !== null && trick.plays.length === PLAYER_COUNT;
}

/** Чей сейчас ход во взятке. */
export function trickTurn(trick: Trick): PlayerId | null {
  if (isTrickComplete(trick)) return null;
  let current = trick.leader;
  for (let i = 0; i < trick.plays.length; i += 1) current = nextPlayer(current);
  return current;
}

/** Нужно ли объявление для этой карты (джокер требует объявления всегда). */
export function requiresDeclaration(card: Card): boolean {
  return isJoker(card);
}

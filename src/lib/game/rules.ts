import {
  cardsOfSuit,
  highestOfSuit,
  isJoker,
  lowestOfSuit,
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
  mode: "normal" | "lead-high" | "lead-low" | "dump";
  dumpTarget: "highest" | "lowest" | null;
};

export function trickContext(trick: Trick): TrickContext | null {
  const leadPlay = trick.plays[0];
  if (!leadPlay) return null;
  const declaration = leadPlay.declaration;
  if (isSuitCard(leadPlay.card)) {
    return {
      leadPlay,
      suit: leadPlay.card.suit,
      mode: "normal",
      dumpTarget: null,
    };
  }
  if (!declaration || declaration.kind !== "lead") {
    throw new Error(
      "Заход джокером обязан содержать объявление масти и режима",
    );
  }
  return {
    leadPlay,
    suit: declaration.suit,
    mode: declaration.mode,
    dumpTarget: declaration.mode === "dump" ? declaration.target : null,
  };
}

/**
 * Что обязан положить игрок, отвечающий на текущий ход.
 * «Джокер старший» и слив «заберёт старшая» требуют самую старшую карту масти.
 * Слив «заберёт младшая» — самую младшую. Нет масти — любую карту.
 */
export function playRequirement(trick: Trick | null): PlayRequirement {
  if (!trick) return { kind: "none" };
  const ctx = trickContext(trick);
  if (!ctx) return { kind: "none" };
  if (ctx.mode === "lead-high") {
    return { kind: "highest-of", suit: ctx.suit };
  }
  if (ctx.mode === "dump") {
    return ctx.dumpTarget === "lowest"
      ? { kind: "lowest-of", suit: ctx.suit }
      : { kind: "highest-of", suit: ctx.suit };
  }
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
  if (requirement.kind === "lowest-of") {
    const lowest = lowestOfSuit(hand, requirement.suit) as SuitCard;
    return [lowest, ...jokers];
  }
  return [...sameSuit, ...jokers];
}

export function isLegalPlay(
  card: Card,
  hand: Card[],
  trick: Trick | null,
): boolean {
  return legalPlays(hand, trick).some((c) => c.id === card.id);
}

/**
 * Джокер забирает взятку у любой карты масти: заход «старший» и «младший»,
 * а в ответ — объявление «наисильнейший козырь».
 */
function claimsTrick(play: Play): boolean {
  const d = play.declaration;
  if (!d) return false;
  if (d.kind === "response") return d.mode === "high";
  return d.mode === "lead-high" || d.mode === "lead-low";
}

/** Кто забрал взятку старшим козырем, если такой джокер есть. */
function highestTrumpWinner(
  trick: Trick,
  shieldBlackLead: boolean,
): PlayerId | null {
  const ctx = trickContext(trick);
  if (!ctx) return null;
  const blackLed =
    shieldBlackLead &&
    isJoker(ctx.leadPlay.card) &&
    ctx.leadPlay.card.color === "black";
  const claims = trick.plays
    .filter(claimsTrick)
    .filter((play) => !blackLed || play === ctx.leadPlay);
  if (claims.length === 0) return null;
  const black = claims.find(
    (play) => isJoker(play.card) && play.card.color === "black",
  );
  return (black ?? claims[0]).player;
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
    const better =
      target === "highest"
        ? play.card.rank > bestRank
        : play.card.rank < bestRank;
    if (better) {
      best = play;
      bestRank = play.card.rank;
    }
  }
  return best;
}

/**
 * Взятку забирает старшая карта масти хода, с поправками на джокеров:
 * — заход «джокер старший» и «джокер младший» забирает взятку у любой карты масти;
 * — джокер «наисильнейший козырь» в ответ тоже забирает взятку; если заявлены оба, чёрный сильнее красного;
 *   заход чёрным «старшим» или «младшим» красный так не перебивает;
 *   на обоих сливах джокер любого цвета, объявленный старшим козырем, забирает взятку;
 * — джокер «самая младшая карта» никогда не берёт;
 * — слив без старшего козыря отдаёт взятку старшей или младшей карте названной масти
 *   (на «заберёт младшая» шестёрка бьёт короля), а если такой масти никто не положил —
 *   взятка остаётся у игрока с джокером.
 */
export function resolveTrick(trick: Trick): PlayerId {
  const ctx = trickContext(trick);
  if (!ctx) throw new Error("Нельзя определить взявшего: во взятке нет карт");

  // На сливе старший козырь любого цвета берёт взятку даже у чёрного захода.
  // На заходе «старший» и «младший» чёрного красный не перебивает.
  const trump = highestTrumpWinner(trick, ctx.mode !== "dump");
  if (trump !== null) return trump;

  const lowestWins = ctx.mode === "dump" && ctx.dumpTarget === "lowest";
  if (lowestWins) {
    const winner = extremeOfSuit(trick.plays, ctx.suit, "lowest");
    return winner ? winner.player : ctx.leadPlay.player;
  }

  const winner = extremeOfSuit(trick.plays, ctx.suit, "highest");
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

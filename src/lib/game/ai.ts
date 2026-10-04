import {
  cardsOfSuit,
  highestOfSuit,
  isJoker,
  isSuitCard,
  SUITS,
  type Card,
  type Suit,
} from "./cards";
import { currentHandRow, legalBidsFor } from "./engine";
import { legalPlays, resolveTrick, trickContext } from "./rules";
import type { GameState, JokerDeclaration, PlayerId, Trick } from "./types";

/**
 * Боты сознательно простые: вся их логика выбирает ход только из разрешённых правилами,
 * поэтому нелегального хода бот сделать не может.
 */

function handStrength(hand: Card[]): number {
  let expected = 0;
  for (const card of hand) {
    if (isJoker(card)) {
      expected += 1;
      continue;
    }
    if (card.rank === 14) expected += 0.85;
    else if (card.rank === 13) expected += 0.55;
    else if (card.rank === 12) expected += 0.3;
    else if (card.rank === 11) expected += 0.12;
  }
  // Длинная масть добавляет шансов: по ней можно продавить лишнюю взятку.
  for (const suit of SUITS) {
    const length = cardsOfSuit(hand, suit).length;
    if (length >= 4) expected += (length - 3) * 0.35;
  }
  return expected;
}

export function chooseBid(state: GameState, player: PlayerId): number {
  const row = currentHandRow(state);
  if (!row) throw new Error("Нет раздачи для торговли");
  const legal = legalBidsFor(state, player);
  const hand = state.hands[player];

  // Тёмные: карт ещё нет, заказ берётся от статистики — в среднем четверть взяток.
  const target =
    hand.length === 0
      ? Math.round((row.cards / 4) * (0.6 + ((state.seed + player * 31 + row.handIndex * 7) % 9) / 10))
      : Math.round(handStrength(hand));

  const clamped = Math.max(0, Math.min(row.cards, target));
  return legal.reduce((best, bid) =>
    Math.abs(bid - clamped) < Math.abs(best - clamped) ? bid : best,
  );
}

type Intent = "win" | "lose";

function intentFor(state: GameState, player: PlayerId): Intent {
  const row = currentHandRow(state);
  if (!row) return "lose";
  if (row.kind === "nabory") return "win";
  if (row.kind === "slivy") return "lose";
  const bid = state.bids[player] ?? 0;
  return state.tricksWon[player] < bid ? "win" : "lose";
}

/** Победит ли карта, если взятка на этом и закончится (грубая оценка для бота). */
function leadsTrickNow(trick: Trick, player: PlayerId, card: Card, declaration: JokerDeclaration | null): boolean {
  const probe: Trick = {
    leader: trick.leader,
    plays: [...trick.plays, { player, card, declaration }],
    winner: null,
  };
  return resolveTrick(probe) === player;
}

function highestCard(cards: Card[]): Card {
  const suited = cards.filter(isSuitCard);
  if (suited.length === 0) return cards[0];
  return suited.reduce((best, c) => (c.rank > best.rank ? c : best));
}

function lowestCard(cards: Card[]): Card {
  const suited = cards.filter(isSuitCard);
  if (suited.length === 0) return cards[0];
  return suited.reduce((best, c) => (c.rank < best.rank ? c : best));
}

function longestSuit(hand: Card[]): Suit {
  return SUITS.reduce((best, suit) =>
    cardsOfSuit(hand, suit).length > cardsOfSuit(hand, best).length ? suit : best,
  );
}

/** Масть, которой у бота нет совсем — удобна, чтобы сливать взятку. */
function voidSuit(hand: Card[]): Suit | null {
  return SUITS.find((suit) => cardsOfSuit(hand, suit).length === 0) ?? null;
}

export type AiMove = { card: Card; declaration: JokerDeclaration | null };

function jokerLead(state: GameState, player: PlayerId, intent: Intent): JokerDeclaration {
  const hand = state.hands[player];
  if (intent === "win") {
    return { kind: "lead", mode: "lead-high", suit: longestSuit(hand) };
  }
  const empty = voidSuit(hand);
  if (empty) {
    // Своей масти нет: требование «по самым большим» и вытягивает чужой козырь, и отдаёт взятку.
    return { kind: "lead", mode: "demand-highest", suit: empty };
  }
  const weakest = SUITS.reduce((best, suit) => {
    const high = highestOfSuit(hand, suit);
    const bestHigh = highestOfSuit(hand, best);
    if (!high) return best;
    if (!bestHigh) return suit;
    return high.rank < bestHigh.rank ? suit : best;
  });
  return { kind: "lead", mode: "dump", suit: weakest, target: "highest" };
}

export function chooseMove(state: GameState, player: PlayerId): AiMove {
  const trick = state.currentTrick;
  if (!trick) throw new Error("Нет взятки для хода");
  const hand = state.hands[player];
  const isLead = trick.plays.length === 0;
  const options = legalPlays(hand, isLead ? null : trick);
  const intent = intentFor(state, player);
  const nonJokers = options.filter(isSuitCard);
  const jokers = options.filter(isJoker);

  if (isLead) {
    if (nonJokers.length === 0) {
      return { card: jokers[0], declaration: jokerLead(state, player, intent) };
    }
    // Джокером заходим, только когда взятка нужна и других козырей не осталось.
    if (intent === "win" && jokers.length > 0 && nonJokers.every((c) => c.rank < 13)) {
      return { card: jokers[0], declaration: jokerLead(state, player, "win") };
    }
    // Взятка не нужна: в сливах и при одних больших картах джокером удобно отдать ход.
    if (intent === "lose" && jokers.length > 0) {
      const lowest = lowestCard(nonJokers);
      const noSmallCards = !isSuitCard(lowest) || lowest.rank >= 11;
      if (currentHandRow(state)?.kind === "slivy" || noSmallCards) {
        return { card: jokers[0], declaration: jokerLead(state, player, "lose") };
      }
    }
    const card = intent === "win" ? highestCard(nonJokers) : lowestCard(nonJokers);
    return { card, declaration: null };
  }

  const ctx = trickContext(trick);
  const isLastToPlay = trick.plays.length === 3;

  if (intent === "win") {
    const winning = nonJokers.filter((c) => leadsTrickNow(trick, player, c, null));
    if (winning.length > 0) {
      // Берём минимальной достаточной картой.
      const card = winning.reduce((best, c) => (c.rank < best.rank ? c : best));
      return { card, declaration: null };
    }
    if (jokers.length > 0 && (isLastToPlay || ctx?.mode === "lead-high")) {
      return { card: jokers[0], declaration: { kind: "response", mode: "high" } };
    }
    if (nonJokers.length > 0) return { card: lowestCard(nonJokers), declaration: null };
    return { card: jokers[0], declaration: { kind: "response", mode: "high" } };
  }

  // Взятка не нужна: джокер как самая младшая карта — лучший способ не брать.
  const safe = nonJokers.filter((c) => !leadsTrickNow(trick, player, c, null));
  if (safe.length > 0) {
    return { card: highestCard(safe), declaration: null };
  }
  if (jokers.length > 0) {
    return { card: jokers[0], declaration: { kind: "response", mode: "low" } };
  }
  return { card: lowestCard(nonJokers), declaration: null };
}

/** Небольшая пауза, чтобы ходы ботов читались за столом. */
export function aiDelay(state: GameState): number {
  return state.phase === "bidding" ? 650 : 850;
}

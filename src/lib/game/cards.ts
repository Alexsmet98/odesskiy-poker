export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** 6..10, 11 = валет, 12 = дама, 13 = король, 14 = туз. */
export const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

export type SuitCard = { kind: "suit"; id: string; suit: Suit; rank: Rank };
export type JokerColor = "red" | "black";
/** Красный джокер (index 0) слабее чёрного (index 1). */
export type JokerCard = { kind: "joker"; id: string; index: 0 | 1; color: JokerColor };
export type Card = SuitCard | JokerCard;

export const SUIT_LABEL: Record<Suit, string> = {
  spades: "пики",
  hearts: "черви",
  diamonds: "бубны",
  clubs: "трефы",
};

export const SUIT_LABEL_ACCUSATIVE: Record<Suit, string> = {
  spades: "пикам",
  hearts: "червям",
  diamonds: "бубнам",
  clubs: "трефам",
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const SUIT_IS_RED: Record<Suit, boolean> = {
  spades: false,
  hearts: true,
  diamonds: true,
  clubs: false,
};

export const RANK_LABEL: Record<Rank, string> = {
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "В",
  12: "Д",
  13: "К",
  14: "Т",
};

export function isJoker(card: Card): card is JokerCard {
  return card.kind === "joker";
}

export function isSuitCard(card: Card): card is SuitCard {
  return card.kind === "suit";
}

export function cardLabel(card: Card): string {
  if (isJoker(card)) return card.color === "black" ? "Чёрный джокер" : "Красный джокер";
  return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

export function suitCardId(suit: Suit, rank: Rank): string {
  return `${suit}-${rank}`;
}

export function makeCard(suit: Suit, rank: Rank): SuitCard {
  return { kind: "suit", id: suitCardId(suit, rank), suit, rank };
}

/** 36 карт + 2 джокера. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(suit, rank));
    }
  }
  deck.push({ kind: "joker", id: "joker-red", index: 0, color: "red" });
  deck.push({ kind: "joker", id: "joker-black", index: 1, color: "black" });
  return deck;
}

export function cardsOfSuit(cards: Card[], suit: Suit): SuitCard[] {
  return cards.filter((c): c is SuitCard => isSuitCard(c) && c.suit === suit);
}

export function highestOfSuit(cards: Card[], suit: Suit): SuitCard | null {
  return cardsOfSuit(cards, suit).reduce<SuitCard | null>(
    (best, c) => (best === null || c.rank > best.rank ? c : best),
    null,
  );
}

export function lowestOfSuit(cards: Card[], suit: Suit): SuitCard | null {
  return cardsOfSuit(cards, suit).reduce<SuitCard | null>(
    (best, c) => (best === null || c.rank < best.rank ? c : best),
    null,
  );
}

/** Сортировка для руки игрока: масти по порядку, внутри масти от старшей к младшей, джокеры в конец. */
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (isJoker(a) && isJoker(b)) return a.index - b.index;
    if (isJoker(a)) return 1;
    if (isJoker(b)) return -1;
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return b.rank - a.rank;
  });
}

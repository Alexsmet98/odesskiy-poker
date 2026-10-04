import type { Card, Suit } from "./cards";
import type { HandKind } from "./schedule";

export type PlayerId = 0 | 1 | 2 | 3;
export const PLAYER_IDS: PlayerId[] = [0, 1, 2, 3];
export const PLAYER_COUNT = 4;

export type Player = {
  id: PlayerId;
  name: string;
  isHuman: boolean;
  /** Короткая характеристика персонажа для атмосферы. */
  tagline: string;
};

/** Чем объявляет джокер игрок, который отвечает на чужой ход. */
export type JokerResponseMode =
  /** Наисильнейший козырь — забирает взятку. */
  | "high"
  /** Самая младшая карта — слабее любой шестёрки. */
  | "low";

/** Чем объявляет джокер игрок, который заходит. */
export type JokerLeadMode =
  /** Джокер «старший»: задаёт масть и забирает взятку. */
  | "lead-high"
  /** Джокер «младший»: задаёт масть, джокер — младшая карта. */
  | "lead-low"
  /** «По самым большим <масть>»: остальные обязаны скинуть старшую карту масти. */
  | "demand-highest"
  /** Слив взятки: взятку заберёт старшая либо младшая карта названной масти. */
  | "dump";

export type JokerDeclaration =
  | { kind: "response"; mode: JokerResponseMode }
  | { kind: "lead"; mode: "lead-high" | "lead-low" | "demand-highest"; suit: Suit }
  | { kind: "lead"; mode: "dump"; suit: Suit; target: "highest" | "lowest" };

export type Play = {
  player: PlayerId;
  card: Card;
  declaration: JokerDeclaration | null;
};

export type Trick = {
  leader: PlayerId;
  plays: Play[];
  /** Заполняется, когда взятка доиграна. */
  winner: PlayerId | null;
};

/** Что требуется от игрока, который кладёт карту в текущую взятку. */
export type PlayRequirement =
  | { kind: "none" }
  /** Обязателен ход в масть, если она есть на руках. */
  | { kind: "follow"; suit: Suit }
  /** Обязательна самая старшая карта масти, если масть есть на руках. */
  | { kind: "highest-of"; suit: Suit };

export type HandResult = {
  handIndex: number;
  kind: HandKind;
  cards: number;
  dealer: PlayerId;
  bids: (number | null)[];
  tricks: number[];
  /** Сколько джокеров было на руках у каждого игрока в этой раздаче (0–2). */
  jokers: number[];
  /** Очки за раздачу; у наборов и сливов 0 — они идут в зачёт НС. */
  points: number[];
};

export type PremiumResult = {
  row: number;
  blockHandIndices: number[];
  points: number[];
};

export type Phase =
  /** Торговля (в тёмных — до сдачи карт). */
  | "bidding"
  | "playing"
  /** Взятка доиграна, ждём подтверждения. */
  | "trick-complete"
  | "hand-complete"
  /** Строка «Пр» показана, ждём перехода к следующему блоку. */
  | "premium"
  | "game-over";

export type LogEntry = {
  id: number;
  row: number;
  text: string;
  tone: "neutral" | "bid" | "trick" | "joker" | "score";
};

export type GameState = {
  seed: number;
  rngCursor: number;
  players: Player[];
  /** Текущая строка расписания, индекс в SCHEDULE. */
  rowIndex: number;
  phase: Phase;
  dealer: PlayerId;
  /** Руки игроков; в тёмных до конца торговли пусты — карты ещё не сданы. */
  hands: Card[][];
  bids: (number | null)[];
  bidTurn: PlayerId | null;
  turn: PlayerId | null;
  tricksWon: number[];
  /** Джокеры в сданных руках текущей раздачи. */
  dealtJokers: number[];
  currentTrick: Trick | null;
  /** Последняя доигранная взятка — единственная, которую разрешено смотреть. */
  lastTrick: Trick | null;
  trickNumber: number;
  results: HandResult[];
  premiums: PremiumResult[];
  log: LogEntry[];
  logCounter: number;
};

export type GameAction =
  | { type: "bid"; player: PlayerId; value: number }
  | { type: "play"; player: PlayerId; card: Card; declaration?: JokerDeclaration | null }
  | { type: "collect-trick" }
  | { type: "next-row" };

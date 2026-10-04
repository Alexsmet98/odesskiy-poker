import {
  cardLabel,
  createDeck,
  isJoker,
  sortHand,
  SUIT_LABEL,
  SUIT_LABEL_ACCUSATIVE,
  type Card,
} from "./cards";
import { createRng, randomSeed, shuffle } from "./rng";
import {
  biddingOrder,
  firstAfterDealer,
  isLegalBid,
  isLegalPlay,
  isTrickComplete,
  nextPlayer,
  resolveTrick,
  trickTurn,
} from "./rules";
import {
  hasBidding,
  isBlindBidding,
  SCHEDULE,
  type HandRow,
  type ScheduleRow,
} from "./schedule";
import { premiumRowResult, scoreHandForPlayer, settle, type Settlement } from "./scoring";
import { tricksCount } from "./text";
import {
  PLAYER_IDS,
  type GameAction,
  type GameState,
  type HandResult,
  type JokerDeclaration,
  type LogEntry,
  type Player,
  type PlayerId,
  type Trick,
} from "./types";

export const DEFAULT_PLAYERS: Player[] = [
  { id: 0, name: "Вы", isHuman: true, tagline: "за столом впервые" },
  { id: 1, name: "Жора Лиман", isHuman: false, tagline: "держит порт и свои карты" },
  { id: 2, name: "Роза", isHuman: false, tagline: "улыбается, когда блефует" },
  { id: 3, name: "Сёма Тихий", isHuman: false, tagline: "считает всё, что упало" },
];

export function currentRow(state: GameState): ScheduleRow {
  const row = SCHEDULE[state.rowIndex];
  if (!row) throw new Error(`Нет строки расписания ${state.rowIndex}`);
  return row;
}

export function currentHandRow(state: GameState): HandRow | null {
  const row = currentRow(state);
  return row.type === "hand" ? row : null;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    hands: state.hands.map((h) => [...h]),
    bids: [...state.bids],
    tricksWon: [...state.tricksWon],
    currentTrick: state.currentTrick
      ? { ...state.currentTrick, plays: [...state.currentTrick.plays] }
      : null,
    lastTrick: state.lastTrick
      ? { ...state.lastTrick, plays: [...state.lastTrick.plays] }
      : null,
    results: state.results.map((r) => ({
      ...r,
      bids: [...r.bids],
      tricks: [...r.tricks],
      points: [...r.points],
    })),
    premiums: state.premiums.map((p) => ({ ...p, points: [...p.points] })),
    log: [...state.log],
  };
}

function pushLog(state: GameState, text: string, tone: LogEntry["tone"] = "neutral"): void {
  state.logCounter += 1;
  state.log.push({ id: state.logCounter, row: currentRow(state).row, text, tone });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

function deal(state: GameState, cards: number): void {
  const rng = createRng((state.seed + state.rngCursor * 7919) >>> 0);
  state.rngCursor += 1;
  const deck = shuffle(createDeck(), rng);
  state.hands = PLAYER_IDS.map((p) => sortHand(deck.slice(p * cards, p * cards + cards)));
}

function startRow(state: GameState): void {
  const row = currentRow(state);
  if (row.type === "premium") {
    state.phase = "premium";
    const premium = premiumRowResult(row, state.results);
    state.premiums = [...state.premiums.filter((p) => p.row !== row.row), premium];
    const winners = PLAYER_IDS.filter((p) => premium.points[p] > 0);
    if (winners.length === 0) {
      pushLog(state, "Премия: блок прошёл без чистых заказов, никому.", "score");
    } else {
      for (const p of winners) {
        pushLog(
          state,
          `Премия ${state.players[p].name}: +${premium.points[p]} — весь блок заказы точно в цель.`,
          "score",
        );
      }
    }
    return;
  }

  state.bids = PLAYER_IDS.map(() => null);
  state.tricksWon = PLAYER_IDS.map(() => 0);
  state.currentTrick = null;
  state.lastTrick = null;
  state.trickNumber = 1;

  if (isBlindBidding(row.kind)) {
    // Тёмные: торговля идёт до сдачи карт.
    state.hands = PLAYER_IDS.map(() => []);
    state.phase = "bidding";
    state.bidTurn = firstAfterDealer(state.dealer);
    state.turn = null;
    pushLog(
      state,
      `Тёмные: ${row.cards} карт, заказы делаются вслепую. Сдаёт ${state.players[state.dealer].name}.`,
      "neutral",
    );
    return;
  }

  deal(state, row.cards);

  if (hasBidding(row.kind)) {
    state.phase = "bidding";
    state.bidTurn = firstAfterDealer(state.dealer);
    state.turn = null;
    pushLog(
      state,
      `Раздача на ${row.cards} карт. Сдаёт ${state.players[state.dealer].name}, торговля пошла.`,
      "neutral",
    );
  } else {
    state.phase = "playing";
    state.bidTurn = null;
    state.turn = firstAfterDealer(state.dealer);
    state.currentTrick = { leader: state.turn, plays: [], winner: null };
    pushLog(
      state,
      row.kind === "nabory"
        ? `Наборы: торговли нет, берём как можно больше. Сдаёт ${state.players[state.dealer].name}.`
        : `Сливы: торговли нет, взятки только во вред. Сдаёт ${state.players[state.dealer].name}.`,
      "neutral",
    );
  }
}

export type CreateGameOptions = {
  seed?: number;
  players?: Player[];
  dealer?: PlayerId;
};

export function createGame(options: CreateGameOptions = {}): GameState {
  const seed = options.seed ?? randomSeed();
  const players = options.players ?? DEFAULT_PLAYERS;
  // Первый сдающий определяется жребием.
  const dealer = options.dealer ?? ((Math.floor(createRng(seed)() * 4) % 4) as PlayerId);

  const state: GameState = {
    seed,
    rngCursor: 0,
    players: players.map((p) => ({ ...p })),
    rowIndex: 0,
    phase: "bidding",
    dealer,
    hands: PLAYER_IDS.map(() => []),
    bids: PLAYER_IDS.map(() => null),
    bidTurn: null,
    turn: null,
    tricksWon: PLAYER_IDS.map(() => 0),
    currentTrick: null,
    lastTrick: null,
    trickNumber: 1,
    results: [],
    premiums: [],
    log: [],
    logCounter: 0,
  };

  pushLog(state, `Жребий: первым сдаёт ${state.players[dealer].name}.`, "neutral");
  startRow(state);
  return state;
}

/** Заказы, уже объявленные в текущей торговле, в порядке очереди. */
function placedBids(state: GameState): number[] {
  return biddingOrder(state.dealer)
    .map((p) => state.bids[p])
    .filter((b): b is number => b !== null);
}

export function isDealerToBid(state: GameState): boolean {
  return state.bidTurn !== null && state.bidTurn === state.dealer;
}

export function legalBidsFor(state: GameState, player: PlayerId): number[] {
  const row = currentHandRow(state);
  if (!row || state.phase !== "bidding") return [];
  const all = Array.from({ length: row.cards + 1 }, (_, i) => i);
  if (player !== state.dealer) return all;
  const placed = placedBids(state).reduce((sum, b) => sum + b, 0);
  return all.filter((bid) => placed + bid !== row.cards);
}

function declarationText(
  state: GameState,
  player: PlayerId,
  declaration: JokerDeclaration,
): string {
  const name = state.players[player].name;
  if (declaration.kind === "response") {
    return declaration.mode === "high"
      ? `${name} кладёт джокера наисильнейшим козырем.`
      : `${name} кладёт джокера самой младшей картой.`;
  }
  switch (declaration.mode) {
    case "lead-high":
      return `${name} заходит джокером: ${SUIT_LABEL[declaration.suit]}, джокер старший.`;
    case "lead-low":
      return `${name} заходит джокером: ${SUIT_LABEL[declaration.suit]}, джокер младший.`;
    case "demand-highest":
      return `${name} заходит джокером: по самым большим ${SUIT_LABEL_ACCUSATIVE[declaration.suit]}.`;
    case "dump":
      return declaration.target === "highest"
        ? `${name} сливает взятку: заберёт старшая карта (${SUIT_LABEL[declaration.suit]}).`
        : `${name} сливает взятку: заберёт младшая карта (${SUIT_LABEL[declaration.suit]}).`;
  }
}

function finishHand(state: GameState): void {
  const row = currentHandRow(state);
  if (!row) throw new Error("Нельзя завершить раздачу: текущая строка не игровая");

  const result: HandResult = {
    handIndex: row.handIndex,
    kind: row.kind,
    cards: row.cards,
    dealer: state.dealer,
    bids: [...state.bids],
    tricks: [...state.tricksWon],
    points: PLAYER_IDS.map((p) => scoreHandForPlayer(row.kind, state.bids[p], state.tricksWon[p])),
  };
  state.results = [...state.results.filter((r) => r.handIndex !== row.handIndex), result];
  state.phase = "hand-complete";
  state.turn = null;

  for (const p of PLAYER_IDS) {
    const name = state.players[p].name;
    if (row.kind === "nabory" || row.kind === "slivy") {
      pushLog(state, `${name}: ${tricksCount(state.tricksWon[p])} в зачёт НС.`, "score");
    } else {
      const bid = state.bids[p] ?? 0;
      const points = result.points[p];
      pushLog(
        state,
        `${name}: заказ ${bid}, взял ${state.tricksWon[p]} — ${points >= 0 ? "+" : ""}${points}.`,
        "score",
      );
    }
  }
}

function applyBid(state: GameState, player: PlayerId, value: number): void {
  const row = currentHandRow(state);
  if (!row || state.phase !== "bidding") throw new Error("Сейчас не торговля");
  if (state.bidTurn !== player) throw new Error("Сейчас не ваша очередь торговаться");
  if (!isLegalBid(value, row.cards, placedBids(state), player === state.dealer)) {
    throw new Error("Такой заказ запрещён правилом «не сходимся»");
  }

  state.bids[player] = value;
  pushLog(
    state,
    value === 0
      ? `${state.players[player].name}: пас.`
      : `${state.players[player].name}: заказ ${value}.`,
    "bid",
  );

  const order = biddingOrder(state.dealer);
  const position = order.indexOf(player);
  const next = order[position + 1];
  if (next !== undefined) {
    state.bidTurn = next;
    return;
  }

  state.bidTurn = null;
  if (isBlindBidding(row.kind)) {
    deal(state, row.cards);
    pushLog(state, "Заказы сделаны вслепую — карты на руки.", "neutral");
  }
  state.phase = "playing";
  state.turn = firstAfterDealer(state.dealer);
  state.currentTrick = { leader: state.turn, plays: [], winner: null };
}

function applyPlay(
  state: GameState,
  player: PlayerId,
  card: Card,
  declaration: JokerDeclaration | null,
): void {
  if (state.phase !== "playing") throw new Error("Сейчас не розыгрыш");
  const trick = state.currentTrick;
  if (!trick) throw new Error("Нет текущей взятки");
  if (trickTurn(trick) !== player) throw new Error("Сейчас не ваш ход");

  const hand = state.hands[player];
  const inHand = hand.find((c) => c.id === card.id);
  if (!inHand) throw new Error("Этой карты нет на руках");
  if (!isLegalPlay(inHand, hand, trick.plays.length === 0 ? null : trick)) {
    throw new Error("Нельзя положить эту карту: нарушает правило хода в масть");
  }

  const isLead = trick.plays.length === 0;
  let finalDeclaration: JokerDeclaration | null = null;
  if (isJoker(inHand)) {
    if (!declaration) throw new Error("Джокер нужно объявить");
    if (isLead && declaration.kind !== "lead") {
      throw new Error("Заход джокером требует объявить масть и режим");
    }
    if (!isLead && declaration.kind !== "response") {
      throw new Error("Ответ джокером объявляется старшим козырем или младшей картой");
    }
    finalDeclaration = declaration;
  }

  state.hands[player] = hand.filter((c) => c.id !== inHand.id);
  trick.plays.push({ player, card: inHand, declaration: finalDeclaration });

  if (finalDeclaration) {
    pushLog(state, declarationText(state, player, finalDeclaration), "joker");
  } else {
    pushLog(state, `${state.players[player].name}: ${cardLabel(inHand)}.`, "trick");
  }

  if (!isTrickComplete(trick)) {
    state.turn = nextPlayer(player);
    return;
  }

  const winner = resolveTrick(trick);
  trick.winner = winner;
  state.tricksWon[winner] += 1;
  state.phase = "trick-complete";
  state.turn = null;
  pushLog(state, `Взятка ${state.trickNumber} — ${state.players[winner].name}.`, "trick");
}

function applyCollectTrick(state: GameState): void {
  if (state.phase !== "trick-complete") throw new Error("Взятка ещё не доиграна");
  const trick = state.currentTrick as Trick;
  const winner = trick.winner as PlayerId;
  state.lastTrick = trick;
  state.currentTrick = null;

  const handsEmpty = state.hands.every((h) => h.length === 0);
  if (handsEmpty) {
    finishHand(state);
    return;
  }

  state.trickNumber += 1;
  state.phase = "playing";
  state.turn = winner;
  state.currentTrick = { leader: winner, plays: [], winner: null };
}

function applyNextRow(state: GameState): void {
  if (state.phase !== "hand-complete" && state.phase !== "premium") {
    throw new Error("Строка ещё не закрыта");
  }
  const row = currentRow(state);
  if (row.type === "hand") {
    // Сдача переходит по кругу только после игровой раздачи.
    state.dealer = nextPlayer(state.dealer);
  }
  if (state.rowIndex + 1 >= SCHEDULE.length) {
    state.phase = "game-over";
    state.rowIndex = SCHEDULE.length - 1;
    const result = settle(state.results, state.premiums);
    const best = PLAYER_IDS.reduce((a, b) => (result.total[b] > result.total[a] ? b : a), 0);
    pushLog(
      state,
      `Партия закрыта. Победа: ${state.players[best].name}, ${result.total[best]} очков.`,
      "score",
    );
    return;
  }
  state.rowIndex += 1;
  startRow(state);
}

export function applyAction(state: GameState, action: GameAction): GameState {
  const next = cloneState(state);
  switch (action.type) {
    case "bid":
      applyBid(next, action.player, action.value);
      break;
    case "play":
      applyPlay(next, action.player, action.card, action.declaration ?? null);
      break;
    case "collect-trick":
      applyCollectTrick(next);
      break;
    case "next-row":
      applyNextRow(next);
      break;
  }
  return next;
}

/** Кто сейчас должен действовать, если действие ждут от игрока. */
export function activePlayer(state: GameState): PlayerId | null {
  if (state.phase === "bidding") return state.bidTurn;
  if (state.phase === "playing") return state.turn;
  return null;
}

export function settlement(state: GameState): Settlement {
  return settle(state.results, state.premiums);
}

/** Прогресс партии по строкам протокола. */
export function progress(state: GameState): { row: number; total: number } {
  return { row: currentRow(state).row, total: SCHEDULE.length };
}

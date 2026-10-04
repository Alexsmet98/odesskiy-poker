import { SCHEDULE, type HandKind, type PremiumRow } from "./schedule";
import { PLAYER_IDS, type HandResult, type PremiumResult } from "./types";

/** Выполненный пас стоит 5 очков. */
export const PASS_POINTS = 5;
/** Точно взятый заказ — 10 очков за взятку. */
export const POINTS_PER_ORDERED_TRICK = 10;
/** Перебор — 1 очко за взятку. */
export const POINTS_PER_TRICK_OVERBID = 1;
/** Недобор — минус 10 за каждую недобранную взятку. */
export const PENALTY_PER_MISSING_TRICK = 10;
/** Взятка в наборах и сливах идёт в зачёт НС по 20 очков. */
export const NS_POINTS_PER_TRICK = 20;
/** Премия удваивает очки за раздачу с самым большим заказом в блоке. */
export const PREMIUM_MULTIPLIER = 2;

/** Очки за раздачу по обычной шкале (без учёта премии). */
export function handPoints(bid: number, tricks: number): number {
  if (tricks === bid) {
    return bid === 0 ? PASS_POINTS : bid * POINTS_PER_ORDERED_TRICK;
  }
  if (tricks > bid) {
    return tricks * POINTS_PER_TRICK_OVERBID;
  }
  return -(bid - tricks) * PENALTY_PER_MISSING_TRICK;
}

/**
 * Очки за раздачу с учётом её типа.
 * Наборы и сливы в столбец очков не пишутся — их взятки идут в зачёт НС в конце партии.
 */
export function scoreHandForPlayer(
  kind: HandKind,
  bid: number | null,
  tricks: number,
): number {
  if (kind === "nabory" || kind === "slivy") return 0;
  if (bid === null) return 0;
  return handPoints(bid, tricks);
}

export type PremiumAward = {
  /** Прошёл ли игрок весь блок без единой ошибки в заказе. */
  qualified: boolean;
  /** Наибольший заказ блока, если игрок прошёл блок. */
  largestBid: number | null;
  points: number;
};

/**
 * Премия начисляется игроку, который в каждой раздаче блока взял ровно свой заказ.
 * Размер: очки за раздачу с самым большим заказом, удвоенные и начисленные целиком
 * (заказ 4 → 2 × 40 = 80; блок из одних выполненных пасов → 2 × 5 = 10).
 */
export function premiumForBlock(
  bids: (number | null)[],
  tricks: number[],
): PremiumAward {
  if (bids.length === 0 || bids.length !== tricks.length) {
    return { qualified: false, largestBid: null, points: 0 };
  }
  const qualified = bids.every((bid, i) => bid !== null && bid === tricks[i]);
  if (!qualified) return { qualified: false, largestBid: null, points: 0 };

  const largestBid = bids.reduce<number>(
    (max, bid) => Math.max(max, bid ?? 0),
    0,
  );
  const base =
    largestBid === 0 ? PASS_POINTS : largestBid * POINTS_PER_ORDERED_TRICK;
  return { qualified: true, largestBid, points: base * PREMIUM_MULTIPLIER };
}

export function premiumRowResult(
  row: PremiumRow,
  results: HandResult[],
): PremiumResult {
  const blockResults = row.blockHandIndices
    .map((handIndex) => results.find((r) => r.handIndex === handIndex))
    .filter((r): r is HandResult => r !== undefined);

  const points = PLAYER_IDS.map((playerId) => {
    if (blockResults.length !== row.blockHandIndices.length) return 0;
    const bids = blockResults.map((r) => r.bids[playerId]);
    const tricks = blockResults.map((r) => r.tricks[playerId]);
    return premiumForBlock(bids, tricks).points;
  });

  return { row: row.row, blockHandIndices: row.blockHandIndices, points };
}

export type Settlement = {
  /** Очки за обычные раздачи, тёмные и премии. */
  regularPoints: number[];
  /** ОН — сумма взяток в наборах. */
  on: number[];
  /** ОС — сумма взяток в сливах. */
  os: number[];
  /** Сум НС = ОН − ОС. */
  sumNs: number[];
  /** Очки НС = Сум НС × 20. */
  pointsNs: number[];
  /** Итого = очки за раздачи и премии + Очки НС. */
  total: number[];
};

export function settle(
  results: HandResult[],
  premiums: PremiumResult[],
): Settlement {
  const regularPoints = PLAYER_IDS.map(
    (p) =>
      results.reduce((sum, r) => sum + r.points[p], 0) +
      premiums.reduce((sum, pr) => sum + pr.points[p], 0),
  );
  const sumTricks = (kind: HandKind) =>
    PLAYER_IDS.map((p) =>
      results
        .filter((r) => r.kind === kind)
        .reduce((sum, r) => sum + r.tricks[p], 0),
    );

  const on = sumTricks("nabory");
  const os = sumTricks("slivy");
  const sumNs = PLAYER_IDS.map((p) => on[p] - os[p]);
  const pointsNs = sumNs.map((v) => v * NS_POINTS_PER_TRICK);
  const total = PLAYER_IDS.map((p) => regularPoints[p] + pointsNs[p]);

  return { regularPoints, on, os, sumNs, pointsNs, total };
}

/** Сколько джокеров побывало на руках у каждого игрока за все сыгранные раздачи. */
export function totalJokers(results: HandResult[]): number[] {
  return PLAYER_IDS.map((p) =>
    results.reduce((sum, r) => sum + (r.jokers[p] ?? 0), 0),
  );
}

export type ScoreboardCell = {
  /** Заказ, показываемый в левой колонке игрока. */
  bid: number | null;
  /** Взятки — показываются в наборах и сливах вместо заказа. */
  tricks: number | null;
  points: number | null;
  /** Накопительный счёт в правой колонке. */
  runningTotal: number | null;
  /** Заказ выполнен точно — в протоколе такие числа обводят. */
  exact: boolean;
  /** Джокеров на руках в этой раздаче: 1 — обводят кружком, 2 — прямоугольником. */
  jokers: number;
};

export type ScoreboardRow = {
  row: number;
  label: string;
  type: "hand" | "premium";
  kind: HandKind | null;
  handIndex: number | null;
  played: boolean;
  cells: ScoreboardCell[];
};

const EMPTY_CELL: ScoreboardCell = {
  bid: null,
  tricks: null,
  points: null,
  runningTotal: null,
  exact: false,
  jokers: 0,
};

/** Строки протокола в том же виде, что на бумаге: заказ и накопительный счёт по каждому игроку. */
export function buildScoreboard(
  results: HandResult[],
  premiums: PremiumResult[],
): ScoreboardRow[] {
  const running = PLAYER_IDS.map(() => 0);
  const rows: ScoreboardRow[] = [];

  for (const scheduleRow of SCHEDULE) {
    if (scheduleRow.type === "hand") {
      const result = results.find((r) => r.handIndex === scheduleRow.handIndex);
      if (!result) {
        rows.push({
          row: scheduleRow.row,
          label: scheduleRow.label,
          type: "hand",
          kind: scheduleRow.kind,
          handIndex: scheduleRow.handIndex,
          played: false,
          cells: PLAYER_IDS.map(() => EMPTY_CELL),
        });
        continue;
      }
      const isNs = result.kind === "nabory" || result.kind === "slivy";
      const cells = PLAYER_IDS.map((p) => {
        if (!isNs) running[p] += result.points[p];
        return {
          bid: result.bids[p],
          tricks: result.tricks[p],
          points: result.points[p],
          runningTotal: isNs ? null : running[p],
          exact: result.bids[p] !== null && result.bids[p] === result.tricks[p],
          jokers: result.jokers[p] ?? 0,
        };
      });
      rows.push({
        row: scheduleRow.row,
        label: scheduleRow.label,
        type: "hand",
        kind: scheduleRow.kind,
        handIndex: scheduleRow.handIndex,
        played: true,
        cells,
      });
    } else {
      const premium = premiums.find((pr) => pr.row === scheduleRow.row);
      if (!premium) {
        rows.push({
          row: scheduleRow.row,
          label: scheduleRow.label,
          type: "premium",
          kind: null,
          handIndex: null,
          played: false,
          cells: PLAYER_IDS.map(() => EMPTY_CELL),
        });
        continue;
      }
      const cells = PLAYER_IDS.map((p) => {
        running[p] += premium.points[p];
        return {
          bid: null,
          tricks: null,
          points: premium.points[p],
          runningTotal: premium.points[p] > 0 ? running[p] : null,
          exact: premium.points[p] > 0,
          jokers: 0,
        };
      });
      rows.push({
        row: scheduleRow.row,
        label: scheduleRow.label,
        type: "premium",
        kind: null,
        handIndex: null,
        played: true,
        cells,
      });
    }
  }

  return rows;
}

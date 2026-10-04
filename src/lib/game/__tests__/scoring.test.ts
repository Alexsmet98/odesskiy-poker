import { describe, expect, it } from "vitest";
import { PREMIUM_ROWS, SCHEDULE, TOTAL_HANDS } from "../schedule";
import {
  buildScoreboard,
  handPoints,
  premiumForBlock,
  premiumRowResult,
  scoreHandForPlayer,
  settle,
} from "../scoring";
import type { HandResult, PlayerId, PremiumResult } from "../types";

describe("очки за раздачу", () => {
  it("даёт 10 за взятку при точном заказе", () => {
    expect(handPoints(1, 1)).toBe(10);
    expect(handPoints(4, 4)).toBe(40);
    expect(handPoints(9, 9)).toBe(90);
  });

  it("даёт 5 за выполненный пас", () => {
    expect(handPoints(0, 0)).toBe(5);
  });

  it("даёт 1 за взятку при переборе", () => {
    expect(handPoints(0, 1)).toBe(1);
    expect(handPoints(2, 5)).toBe(5);
    expect(handPoints(2, 4)).toBe(4);
  });

  it("снимает 10 за каждую недобранную взятку", () => {
    expect(handPoints(4, 2)).toBe(-20);
    expect(handPoints(3, 0)).toBe(-30);
  });

  it("в наборах и сливах очки за раздачу не пишутся", () => {
    expect(scoreHandForPlayer("nabory", null, 5)).toBe(0);
    expect(scoreHandForPlayer("slivy", null, 3)).toBe(0);
    expect(scoreHandForPlayer("normal", 2, 2)).toBe(20);
    expect(scoreHandForPlayer("dark", 2, 1)).toBe(-10);
  });
});

describe("премия", () => {
  it("удваивает раздачу с самым большим заказом целиком", () => {
    const award = premiumForBlock([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(award.qualified).toBe(true);
    expect(award.largestBid).toBe(4);
    expect(award.points).toBe(80);
  });

  it("считается по наибольшему заказу, а не по числу карт", () => {
    expect(premiumForBlock([1, 2, 1, 0], [1, 2, 1, 0]).points).toBe(40);
    expect(premiumForBlock([3, 1, 2, 2], [3, 1, 2, 2]).points).toBe(60);
  });

  it("за блок из одних выполненных пасов даёт 10", () => {
    const award = premiumForBlock([0, 0, 0, 0], [0, 0, 0, 0]);
    expect(award.qualified).toBe(true);
    expect(award.largestBid).toBe(0);
    expect(award.points).toBe(10);
  });

  it("не начисляется, если хотя бы одна раздача блока не в цель", () => {
    expect(premiumForBlock([1, 2, 3, 4], [1, 2, 3, 3]).points).toBe(0);
    expect(premiumForBlock([0, 0, 0, 0], [0, 0, 1, 0]).points).toBe(0);
    expect(premiumForBlock([1, 2, 3, 4], [1, 2, 3, 5]).points).toBe(0);
  });

  it("не начисляется при незавершённом блоке", () => {
    expect(premiumForBlock([1, 2, null], [1, 2, 0]).points).toBe(0);
    expect(premiumForBlock([], []).points).toBe(0);
  });

  it("раздаётся по строке протокола каждому, кто прошёл блок чисто", () => {
    const results: HandResult[] = [0, 1, 2, 3].map((handIndex) => ({
      handIndex,
      kind: "normal",
      cards: handIndex + 1,
      dealer: 0,
      // Игрок 0 проходит блок чисто, игрок 1 ошибается в последней раздаче.
      bids: [handIndex + 1, handIndex + 1, 0, 0],
      jokers: [0, 0, 0, 0],
      tricks: [handIndex + 1, handIndex === 3 ? 0 : handIndex + 1, 0, 1],
      points: [0, 0, 0, 0],
    }));
    const row = PREMIUM_ROWS[0];
    expect(row.blockHandIndices).toEqual([0, 1, 2, 3]);
    const premium = premiumRowResult(row, results);
    // Игрок 2 весь блок пасовал и все пасы выполнил — 2 × 5.
    expect(premium.points).toEqual([80, 0, 10, 0]);
  });
});

describe("зачёт наборов и сливов", () => {
  const makeNs = (): HandResult[] => [
    ...[0, 1, 2, 3].map((i) => ({
      handIndex: 28 + i,
      kind: "nabory" as const,
      cards: 9,
      dealer: 0 as PlayerId,
      bids: [null, null, null, null],
      jokers: [0, 0, 0, 0],
      tricks: [[2, 0, 1, 3][i], [5, 0, 6, 0][i], [0, 2, 1, 5][i], [2, 6, 1, 2][i]],
      points: [0, 0, 0, 0],
    })),
    ...[0, 1, 2, 3].map((i) => ({
      handIndex: 32 + i,
      kind: "slivy" as const,
      cards: 9,
      dealer: 0 as PlayerId,
      bids: [null, null, null, null],
      jokers: [0, 0, 0, 0],
      tricks: [[5, 3, 1, 1][i], [2, 2, 2, 5][i], [2, 3, 3, 2][i], [0, 0, 4, 1][i]],
      points: [0, 0, 0, 0],
    })),
  ];

  it("сводит ОН, ОС, Сум НС и Очки НС так же, как в бумажном протоколе", () => {
    const results = makeNs();
    const settlement = settle(results, []);
    // Цифры взяты из примера протокола: Элина 6/10, Тимур 11/11, Артём 8/10, Полина 11/5.
    expect(settlement.on).toEqual([6, 11, 8, 11]);
    expect(settlement.os).toEqual([10, 11, 10, 5]);
    expect(settlement.sumNs).toEqual([-4, 0, -2, 6]);
    expect(settlement.pointsNs).toEqual([-80, 0, -40, 120]);
  });

  it("складывает Итого из очков за раздачи, премий и Очков НС", () => {
    const results: HandResult[] = [
      {
        handIndex: 0,
        kind: "normal",
        cards: 1,
        dealer: 0,
        bids: [1, 0, 0, 0],
        jokers: [0, 0, 0, 0],
        tricks: [1, 0, 0, 0],
        points: [10, 5, 5, 5],
      },
      ...makeNs(),
    ];
    const premiums: PremiumResult[] = [
      { row: 5, blockHandIndices: [0, 1, 2, 3], points: [80, 0, 0, 0] },
    ];
    const settlement = settle(results, premiums);
    expect(settlement.regularPoints).toEqual([90, 5, 5, 5]);
    expect(settlement.total).toEqual([10, 5, -35, 125]);
  });
});

describe("расписание партии", () => {
  it("содержит 43 строки: 36 раздач и 7 премий", () => {
    expect(SCHEDULE).toHaveLength(43);
    expect(TOTAL_HANDS).toBe(36);
    expect(PREMIUM_ROWS).toHaveLength(7);
    expect(PREMIUM_ROWS.map((r) => r.row)).toEqual([5, 10, 15, 20, 25, 30, 35]);
  });

  it("идёт в порядке 1-2-3-4, 5-6-7-8, 9×4, 8-7-6-5, 4-3-2-1, 9×4, тёмные, наборы, сливы", () => {
    const hands = SCHEDULE.filter((r) => r.type === "hand");
    expect(hands.map((r) => (r.type === "hand" ? r.cards : 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
      9, 9, 9, 9, 9,
    ]);
    expect(hands.map((r) => (r.type === "hand" ? r.kind : null)).slice(24)).toEqual([
      "dark",
      "dark",
      "dark",
      "dark",
      "nabory",
      "nabory",
      "nabory",
      "nabory",
      "slivy",
      "slivy",
      "slivy",
      "slivy",
    ]);
  });

  it("не ставит строку премии после наборов и сливов", () => {
    expect(PREMIUM_ROWS.at(-1)?.blockHandIndices).toEqual([24, 25, 26, 27]);
  });
});

describe("таблица протокола", () => {
  it("ведёт накопительный счёт и обводит точные заказы", () => {
    const results: HandResult[] = [
      {
        handIndex: 0,
        kind: "normal",
        cards: 1,
        dealer: 0,
        bids: [1, 0, 0, 0],
        jokers: [0, 0, 0, 0],
        tricks: [1, 0, 0, 0],
        points: [10, 5, 5, 5],
      },
      {
        handIndex: 1,
        kind: "normal",
        cards: 2,
        dealer: 1,
        bids: [2, 0, 1, 0],
        jokers: [0, 0, 0, 0],
        tricks: [1, 0, 1, 1],
        points: [-10, 5, 10, 1],
      },
    ];
    const rows = buildScoreboard(results, []);
    expect(rows).toHaveLength(43);
    expect(rows[0].cells[0]).toMatchObject({ bid: 1, runningTotal: 10, exact: true });
    expect(rows[1].cells[0]).toMatchObject({ bid: 2, runningTotal: 0, exact: false });
    expect(rows[1].cells[2]).toMatchObject({ bid: 1, runningTotal: 15, exact: true });
    expect(rows[2].played).toBe(false);
  });

  it("в строках наборов и сливов накопительный счёт не меняется", () => {
    const results: HandResult[] = [
      {
        handIndex: 28,
        kind: "nabory",
        cards: 9,
        dealer: 0,
        bids: [null, null, null, null],
        jokers: [0, 0, 0, 0],
        tricks: [3, 2, 2, 2],
        points: [0, 0, 0, 0],
      },
    ];
    const rows = buildScoreboard(results, []);
    const naboryRow = rows.find((r) => r.handIndex === 28);
    expect(naboryRow?.cells[0]).toMatchObject({ tricks: 3, runningTotal: null });
  });
});

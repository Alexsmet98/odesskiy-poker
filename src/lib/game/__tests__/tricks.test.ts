import { describe, expect, it } from "vitest";
import { cardsOfSuit } from "../cards";
import {
  legalPlays,
  playRequirement,
  resolveTrick,
  trickContext,
} from "../rules";
import { c, joker, play, trick } from "./helpers";

describe("ход в масть", () => {
  it("требует масть хода, если она есть на руках", () => {
    const current = trick(0, [play(0, c("spades", 10))]);
    const hand = [c("spades", 7), c("spades", 14), c("hearts", 13)];
    expect(playRequirement(current)).toEqual({
      kind: "follow",
      suit: "spades",
    });
    expect(legalPlays(hand, current).map((x) => x.id)).toEqual([
      "spades-7",
      "spades-14",
    ]);
  });

  it("разрешает любую карту, если масти хода нет", () => {
    const current = trick(0, [play(0, c("spades", 10))]);
    const hand = [c("hearts", 7), c("clubs", 14)];
    expect(legalPlays(hand, current)).toHaveLength(2);
  });

  it("разрешает джокера даже при наличии масти хода", () => {
    const current = trick(0, [play(0, c("spades", 10))]);
    const hand = [c("spades", 7), joker(0)];
    expect(legalPlays(hand, current).map((x) => x.id)).toEqual([
      "spades-7",
      "joker-red",
    ]);
  });

  it("не ограничивает заходящего", () => {
    const hand = [c("spades", 7), c("hearts", 9), joker(1)];
    expect(legalPlays(hand, null)).toHaveLength(3);
    expect(playRequirement(null)).toEqual({ kind: "none" });
  });
});

describe("взятка без джокеров", () => {
  it("уходит старшей карте масти хода", () => {
    const current = trick(1, [
      play(1, c("hearts", 10)),
      play(2, c("hearts", 14)),
      play(3, c("hearts", 6)),
      play(0, c("spades", 14)),
    ]);
    expect(resolveTrick(current)).toBe(2);
  });

  it("не считает карты других мастей, даже если они старше", () => {
    const current = trick(0, [
      play(0, c("clubs", 6)),
      play(1, c("spades", 14)),
      play(2, c("hearts", 14)),
      play(3, c("diamonds", 14)),
    ]);
    expect(resolveTrick(current)).toBe(0);
  });
});

describe("джокер в ответ на чужой ход", () => {
  it("как наисильнейший козырь забирает взятку даже у туза", () => {
    const current = trick(0, [
      play(0, c("hearts", 14)),
      play(1, joker(0), { kind: "response", mode: "high" }),
      play(2, c("hearts", 13)),
      play(3, c("hearts", 6)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it("как самая младшая карта не берёт взятку", () => {
    const current = trick(0, [
      play(0, c("hearts", 9)),
      play(1, joker(0), { kind: "response", mode: "low" }),
      play(2, c("hearts", 7)),
      play(3, c("hearts", 6)),
    ]);
    expect(resolveTrick(current)).toBe(0);
  });

  it("младший джокер не берёт, даже если больше никто не положил масть хода", () => {
    const current = trick(0, [
      play(0, c("hearts", 6)),
      play(1, joker(0), { kind: "response", mode: "low" }),
      play(2, c("spades", 14)),
      play(3, c("clubs", 14)),
    ]);
    expect(resolveTrick(current)).toBe(0);
  });

  it("при двух заявках на старшего козыря чёрный джокер сильнее красного, если он лёг позже", () => {
    const current = trick(0, [
      play(0, c("hearts", 14)),
      play(1, joker(0), { kind: "response", mode: "high" }),
      play(2, joker(1), { kind: "response", mode: "high" }),
      play(3, c("hearts", 6)),
    ]);
    expect(resolveTrick(current)).toBe(2);
  });

  it("при двух заявках на старшего козыря чёрный джокер сильнее красного, даже если он лёг раньше", () => {
    const current = trick(0, [
      play(0, c("hearts", 14)),
      play(1, joker(1), { kind: "response", mode: "high" }),
      play(2, joker(0), { kind: "response", mode: "high" }),
      play(3, c("hearts", 6)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it("красный джокер, объявленный старшим, уступает чёрному, заходившему старшим", () => {
    const current = trick(1, [
      play(1, joker(1), { kind: "lead", mode: "lead-high", suit: "clubs" }),
      play(2, joker(0), { kind: "response", mode: "high" }),
      play(3, c("clubs", 14)),
      play(0, c("clubs", 6)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it.each([
    ["младшим", { kind: "lead", mode: "lead-low", suit: "clubs" } as const, 1],
  ])(
    "красный джокер, объявленный старшим в ответ, не бьёт заход чёрного %s",
    (_name, declaration, winner) => {
      const current = trick(1, [
        play(1, joker(1), declaration),
        play(2, joker(0), { kind: "response", mode: "high" }),
        play(3, c("clubs", 14)),
        play(0, c("clubs", 6)),
      ]);
      expect(resolveTrick(current)).toBe(winner);
    },
  );

  it("красный джокер старшим в ответ бьёт заход красного младшим", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-low", suit: "clubs" }),
      play(2, c("clubs", 14)),
      play(3, joker(1), { kind: "response", mode: "high" }),
      play(0, c("clubs", 6)),
    ]);
    expect(resolveTrick(current)).toBe(3);
  });

  it("чёрный джокер, объявленный младшим, не отбирает взятку у красного старшего", () => {
    const current = trick(0, [
      play(0, c("hearts", 14)),
      play(1, joker(1), { kind: "response", mode: "low" }),
      play(2, joker(0), { kind: "response", mode: "high" }),
      play(3, c("hearts", 6)),
    ]);
    expect(resolveTrick(current)).toBe(2);
  });
});

describe("заход джокером: старший", () => {
  it("задаёт масть и забирает взятку", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-high", suit: "clubs" }),
      play(2, c("clubs", 14)),
      play(3, c("clubs", 13)),
      play(0, c("hearts", 6)),
    ]);
    expect(trickContext(current)?.suit).toBe("clubs");
    expect(resolveTrick(current)).toBe(1);
  });

  it("обязывает остальных ходить в заявленную масть", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-high", suit: "clubs" }),
    ]);
    const hand = [c("clubs", 8), c("hearts", 14)];
    expect(legalPlays(hand, current).map((x) => x.id)).toEqual(["clubs-8"]);
  });

  it("уступает ответному джокеру, объявленному старшим козырем", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-high", suit: "clubs" }),
      play(2, joker(1), { kind: "response", mode: "high" }),
      play(3, c("clubs", 13)),
      play(0, c("clubs", 6)),
    ]);
    expect(resolveTrick(current)).toBe(2);
  });
});

describe("заход джокером: младший", () => {
  it("забирает взятку даже против шестёрки названной масти", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-low", suit: "clubs" }),
      play(2, c("clubs", 9)),
      play(3, c("clubs", 7)),
      play(0, c("hearts", 6)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it("уступает чёрному джокеру, объявленному старшим козырем", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-low", suit: "clubs" }),
      play(2, joker(1), { kind: "response", mode: "high" }),
      play(3, c("clubs", 9)),
      play(0, c("clubs", 6)),
    ]);
    expect(resolveTrick(current)).toBe(2);
  });

  it("заход чёрным красный джокер старшим не перебивает", () => {
    const current = trick(1, [
      play(1, joker(1), { kind: "lead", mode: "lead-low", suit: "clubs" }),
      play(2, joker(0), { kind: "response", mode: "high" }),
      play(3, c("clubs", 9)),
      play(0, c("clubs", 6)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it("обязывает остальных ходить в заявленную масть", () => {
    const current = trick(1, [
      play(1, joker(0), { kind: "lead", mode: "lead-low", suit: "clubs" }),
    ]);
    const hand = [c("clubs", 8), c("hearts", 14), joker(1)];
    expect(legalPlays(hand, current).map((x) => x.id)).toEqual([
      "clubs-8",
      "joker-black",
    ]);
  });
});

describe("заход джокером: слив взятки", () => {
  it("отдаёт взятку старшей карте заявленной масти", () => {
    const current = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "highest",
      }),
      play(2, c("diamonds", 9)),
      play(3, c("diamonds", 12)),
      play(0, c("diamonds", 6)),
    ]);
    expect(resolveTrick(current)).toBe(3);
  });

  it("отдаёт взятку младшей карте, если объявлена младшая", () => {
    const current = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "lowest",
      }),
      play(2, c("diamonds", 9)),
      play(3, c("diamonds", 12)),
      play(0, c("diamonds", 6)),
    ]);
    expect(resolveTrick(current)).toBe(0);
  });

  it("оставляет взятку заходившему, если заявленной масти никто не положил", () => {
    const current = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "highest",
      }),
      play(2, c("hearts", 9)),
      play(3, c("spades", 12)),
      play(0, c("clubs", 6)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it("слив «заберёт младшая черви»: шестёрка бьёт короля", () => {
    const current = trick(0, [
      play(0, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "hearts",
        target: "lowest",
      }),
      play(1, c("hearts", 6)),
      play(2, c("hearts", 13)),
      play(3, c("clubs", 14)),
    ]);
    expect(resolveTrick(current)).toBe(1);
  });

  it("слив «заберёт младшая»: джокер младшей картой взятку не берёт", () => {
    const current = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "lowest",
      }),
      play(2, joker(1), { kind: "response", mode: "low" }),
      play(3, c("diamonds", 12)),
      play(0, c("diamonds", 6)),
    ]);
    expect(resolveTrick(current)).toBe(0);
  });

  it("слив «заберёт младшая»: джокер любого цвета старшим козырем забирает взятку", () => {
    const redLeads = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "hearts",
        target: "lowest",
      }),
      play(2, c("hearts", 6)),
      play(3, joker(1), { kind: "response", mode: "high" }),
      play(0, c("hearts", 13)),
    ]);
    const blackLeads = trick(1, [
      play(1, joker(1), {
        kind: "lead",
        mode: "dump",
        suit: "hearts",
        target: "lowest",
      }),
      play(2, joker(0), { kind: "response", mode: "high" }),
      play(3, c("hearts", 6)),
      play(0, c("hearts", 13)),
    ]);
    expect(resolveTrick(redLeads)).toBe(3);
    expect(resolveTrick(blackLeads)).toBe(2);
  });

  it("слив «заберёт старшая»: джокер любого цвета старшим козырем забирает взятку", () => {
    const redLeads = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "highest",
      }),
      play(2, c("diamonds", 9)),
      play(3, joker(1), { kind: "response", mode: "high" }),
      play(0, c("diamonds", 6)),
    ]);
    const blackLeads = trick(1, [
      play(1, joker(1), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "highest",
      }),
      play(2, joker(0), { kind: "response", mode: "high" }),
      play(3, c("diamonds", 12)),
      play(0, c("diamonds", 6)),
    ]);
    expect(resolveTrick(redLeads)).toBe(3);
    expect(resolveTrick(blackLeads)).toBe(2);
  });

  it("слив «заберёт старшая»: джокер, положенный младшей картой, не берёт", () => {
    const current = trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target: "highest",
      }),
      play(2, joker(1), { kind: "response", mode: "low" }),
      play(3, c("diamonds", 12)),
      play(0, c("diamonds", 6)),
    ]);
    expect(resolveTrick(current)).toBe(3);
  });
});

describe("слив: принуждение к старшей/младшей карте масти", () => {
  const dump = (target: "highest" | "lowest") =>
    trick(1, [
      play(1, joker(0), {
        kind: "lead",
        mode: "dump",
        suit: "diamonds",
        target,
      }),
    ]);
  const hand = [
    c("diamonds", 6),
    c("diamonds", 9),
    c("diamonds", 12),
    c("hearts", 7),
    joker(1),
  ];

  it("«заберёт старшая» разрешает только старшую карту масти и джокера", () => {
    expect(playRequirement(dump("highest"))).toEqual({
      kind: "highest-of",
      suit: "diamonds",
    });
    expect(legalPlays(hand, dump("highest")).map((x) => x.id)).toEqual([
      "diamonds-12",
      "joker-black",
    ]);
  });

  it("«заберёт младшая» разрешает только младшую карту масти и джокера", () => {
    expect(playRequirement(dump("lowest"))).toEqual({
      kind: "lowest-of",
      suit: "diamonds",
    });
    expect(legalPlays(hand, dump("lowest")).map((x) => x.id)).toEqual([
      "diamonds-6",
      "joker-black",
    ]);
  });

  it("если масти нет, можно любую карту", () => {
    const noSuit = [c("hearts", 7), c("clubs", 8)];
    expect(legalPlays(noSuit, dump("lowest"))).toHaveLength(2);
    expect(legalPlays(noSuit, dump("highest"))).toHaveLength(2);
  });
});

describe("контекст взятки", () => {
  it("требует объявления при заходе джокером", () => {
    const current = trick(0, [play(0, joker(0))]);
    expect(() => trickContext(current)).toThrow(/объявление/);
  });

  it("на пустой взятке контекста нет", () => {
    expect(trickContext(trick(0, []))).toBeNull();
  });

  it("помогает выбрать старшую карту масти", () => {
    const hand = [c("spades", 7), c("spades", 14), c("hearts", 9)];
    expect(cardsOfSuit(hand, "spades")).toHaveLength(2);
  });
});

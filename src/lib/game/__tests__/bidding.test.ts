import { describe, expect, it } from "vitest";
import { applyAction, createGame, currentHandRow, legalBidsFor } from "../engine";
import { biddingOrder, isLegalBid, legalBids } from "../rules";
import { PLAYER_IDS, type GameState, type PlayerId } from "../types";
import { fastForwardToRow } from "./autoplay";

describe("порядок торговли", () => {
  it("начинается слева от сдающего и заканчивается сдающим", () => {
    expect(biddingOrder(0)).toEqual([1, 2, 3, 0]);
    expect(biddingOrder(2)).toEqual([3, 0, 1, 2]);
  });
});

describe("правило «не сходимся»", () => {
  it("не ограничивает игроков до сдающего", () => {
    expect(legalBids(4, [], false)).toEqual([0, 1, 2, 3, 4]);
    expect(legalBids(4, [1, 1], false)).toEqual([0, 1, 2, 3, 4]);
  });

  it("запрещает сдающему заказ, замыкающий сумму на числе карт", () => {
    // Карт 4, заказано 1 + 1 + 1 = 3, значит сдающему нельзя 1.
    expect(legalBids(4, [1, 1, 1], true)).toEqual([0, 2, 3, 4]);
    expect(isLegalBid(1, 4, [1, 1, 1], true)).toBe(false);
    expect(isLegalBid(0, 4, [1, 1, 1], true)).toBe(true);
  });

  it("оставляет сдающему все заказы, если сумма уже не сходится ни при каком", () => {
    // Карт 1, заказано 1 + 1 + 1 = 3: сумма уже больше числа карт.
    expect(legalBids(1, [1, 1, 1], true)).toEqual([0, 1]);
  });

  it("запрещает пас сдающему, когда сумма уже равна числу карт", () => {
    expect(legalBids(3, [1, 1, 1], true)).toEqual([1, 2, 3]);
  });

  it("всегда оставляет сдающему хотя бы один разрешённый заказ", () => {
    for (let cards = 1; cards <= 9; cards += 1) {
      for (let a = 0; a <= cards; a += 1) {
        for (let b = 0; b <= cards; b += 1) {
          for (let d = 0; d <= cards; d += 1) {
            expect(legalBids(cards, [a, b, d], true).length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

function bidAll(state: GameState, values: Record<PlayerId, number>): GameState {
  let next = state;
  for (const player of biddingOrder(state.dealer)) {
    next = applyAction(next, { type: "bid", player, value: values[player] });
  }
  return next;
}

describe("торговля в движке", () => {
  it("ведёт очередь и переходит к розыгрышу после четвёртого заказа", () => {
    const game = createGame({ seed: 42, dealer: 0 });
    expect(game.phase).toBe("bidding");
    expect(game.bidTurn).toBe(1);

    // Карта одна: если все пасуют, сдающему нельзя заказать её — сумма сошлась бы с раздачей.
    const after = bidAll(game, { 0: 0, 1: 0, 2: 0, 3: 0 });
    expect(after.phase).toBe("playing");
    expect(after.bidTurn).toBeNull();
    // Первый ход — слева от сдающего.
    expect(after.turn).toBe(1);
    expect(after.currentTrick?.leader).toBe(1);
  });

  it("не даёт сдающему сделать заказ, замыкающий сумму", () => {
    const game = createGame({ seed: 7, dealer: 0 });
    const row = currentHandRow(game);
    expect(row?.cards).toBe(1);

    let next = applyAction(game, { type: "bid", player: 1, value: 1 });
    next = applyAction(next, { type: "bid", player: 2, value: 0 });
    next = applyAction(next, { type: "bid", player: 3, value: 0 });
    // Карта одна, уже заказана одна взятка — сдающему остаётся только заказать её тоже.
    expect(legalBidsFor(next, 0)).toEqual([1]);
    expect(() => applyAction(next, { type: "bid", player: 0, value: 0 })).toThrow(
      /не сходимся/,
    );
  });

  it("не принимает заказ вне очереди", () => {
    const game = createGame({ seed: 11, dealer: 0 });
    expect(() => applyAction(game, { type: "bid", player: 2, value: 0 })).toThrow(
      /очередь/,
    );
  });

  it("в тёмных торгуется до сдачи карт", () => {
    let game = createGame({ seed: 5, dealer: 0 });
    // Доходим до первой тёмной раздачи (строка 31 протокола).
    game = fastForwardToRow(game, 31);
    expect(currentHandRow(game)?.kind).toBe("dark");
    expect(game.phase).toBe("bidding");
    for (const p of PLAYER_IDS) expect(game.hands[p]).toHaveLength(0);

    const dealt = bidAll(game, { 0: 2, 1: 2, 2: 2, 3: 2 });
    expect(dealt.phase).toBe("playing");
    for (const p of PLAYER_IDS) expect(dealt.hands[p]).toHaveLength(9);
  });

  it("в наборах и сливах торговли нет", () => {
    let game = createGame({ seed: 5, dealer: 0 });
    game = fastForwardToRow(game, 36);
    expect(currentHandRow(game)?.kind).toBe("nabory");
    expect(game.phase).toBe("playing");
    expect(game.bids.every((b) => b === null)).toBe(true);
  });
});

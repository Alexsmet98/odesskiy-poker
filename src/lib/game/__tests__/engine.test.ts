import { describe, expect, it } from "vitest";
import { chooseBid, chooseMove } from "../ai";
import { isJoker } from "../cards";
import {
  applyAction,
  createGame,
  currentHandRow,
  legalBidsFor,
  settlement,
} from "../engine";
import { isLegalBid, isLegalPlay, legalPlays } from "../rules";
import { biddingOrder } from "../rules";
import { buildScoreboard } from "../scoring";
import { SCHEDULE, TOTAL_HANDS } from "../schedule";
import { PLAYER_IDS, type GameState, type PlayerId } from "../types";
import { playToEnd, stepAutomatically } from "./autoplay";

function assertStateIsSane(state: GameState): void {
  const row = currentHandRow(state);
  if (state.phase === "playing" && row) {
    const player = state.turn as PlayerId;
    const trick = state.currentTrick;
    expect(trick).not.toBeNull();
    const options = legalPlays(
      state.hands[player],
      trick!.plays.length === 0 ? null : trick!,
    );
    expect(options.length).toBeGreaterThan(0);
    // Все предложенные ходы должны быть на руках у игрока.
    for (const card of options) {
      expect(state.hands[player].some((c) => c.id === card.id)).toBe(true);
    }
  }
  if (state.phase === "bidding" && row) {
    const player = state.bidTurn as PlayerId;
    const placed = biddingOrder(state.dealer)
      .map((p) => state.bids[p])
      .filter((b): b is number => b !== null);
    const bid = chooseBid(state, player);
    expect(isLegalBid(bid, row.cards, placed, player === state.dealer)).toBe(
      true,
    );
  }
}

describe("партия целиком", () => {
  it("доигрывается до конца без нелегальных ходов", () => {
    let game = createGame({ seed: 20260824, dealer: 0 });
    let guard = 0;
    while (game.phase !== "game-over" && guard < 50000) {
      guard += 1;
      assertStateIsSane(game);
      if (game.phase === "playing") {
        const player = game.turn as PlayerId;
        const move = chooseMove(game, player);
        const trick = game.currentTrick!;
        expect(
          isLegalPlay(
            move.card,
            game.hands[player],
            trick.plays.length === 0 ? null : trick,
          ),
        ).toBe(true);
        if (isJoker(move.card)) expect(move.declaration).not.toBeNull();
      }
      game = stepAutomatically(game);
    }
    expect(game.phase).toBe("game-over");
    expect(game.results).toHaveLength(TOTAL_HANDS);
    expect(game.premiums).toHaveLength(7);
    expect(game.rowIndex).toBe(SCHEDULE.length - 1);
  });

  it("в каждой раздаче разыграны все взятки", () => {
    const game = playToEnd(createGame({ seed: 1234, dealer: 2 }));
    for (const result of game.results) {
      const taken = result.tricks.reduce((sum, t) => sum + t, 0);
      expect(taken).toBe(result.cards);
    }
  });

  it("сдача идёт по кругу, по одной раздаче на игрока", () => {
    const game = playToEnd(createGame({ seed: 99, dealer: 1 }));
    const dealers = game.results
      .slice()
      .sort((a, b) => a.handIndex - b.handIndex)
      .map((r) => r.dealer);
    expect(dealers.slice(0, 6)).toEqual([1, 2, 3, 0, 1, 2]);
  });

  it("сумма заказов в обычных раздачах никогда не равна числу карт", () => {
    const game = playToEnd(createGame({ seed: 777, dealer: 3 }));
    for (const result of game.results) {
      if (result.kind !== "normal" && result.kind !== "dark") continue;
      const total = result.bids.reduce<number>((sum, b) => sum + (b ?? 0), 0);
      expect(total).not.toBe(result.cards);
    }
  });

  it("итоговый счёт сходится с суммой строк протокола", () => {
    const game = playToEnd(createGame({ seed: 31337, dealer: 0 }));
    const final = settlement(game);
    for (const p of PLAYER_IDS) {
      const handSum = game.results.reduce((sum, r) => sum + r.points[p], 0);
      const premiumSum = game.premiums.reduce(
        (sum, pr) => sum + pr.points[p],
        0,
      );
      expect(final.regularPoints[p]).toBe(handSum + premiumSum);
      expect(final.total[p]).toBe(final.regularPoints[p] + final.sumNs[p] * 20);
    }
    // Все 36 взяток наборов и сливов распределены между игроками.
    expect(final.on.reduce((a, b) => a + b, 0)).toBe(36);
    expect(final.os.reduce((a, b) => a + b, 0)).toBe(36);
  });

  it("устойчива на разных раздачах", () => {
    for (const seed of [1, 2, 3, 101, 2024, 65535]) {
      const game = playToEnd(
        createGame({ seed, dealer: (seed % 4) as PlayerId }),
      );
      expect(game.phase).toBe("game-over");
      expect(game.results).toHaveLength(TOTAL_HANDS);
    }
  });
});

describe("защита движка от нелегальных действий", () => {
  it("не даёт положить карту не из руки", () => {
    let game = createGame({ seed: 8, dealer: 0 });
    for (const player of biddingOrder(game.dealer)) {
      const value = legalBidsFor(game, player)[0];
      game = applyAction(game, { type: "bid", player, value });
    }
    const other = game.hands[2][0];
    expect(() =>
      applyAction(game, {
        type: "play",
        player: game.turn as PlayerId,
        card: other,
      }),
    ).toThrow(/нет на руках/);
  });

  it("не даёт нарушить ход в масть", () => {
    let game = createGame({ seed: 4242, dealer: 0 });
    // Доходим до раздачи, где на руках больше одной карты.
    while ((currentHandRow(game)?.cards ?? 0) < 4 || game.phase !== "playing") {
      game = stepAutomatically(game);
      if (game.phase === "game-over")
        throw new Error("Партия закончилась раньше времени");
    }
    const leader = game.turn as PlayerId;
    const lead = game.hands[leader].find((card) => !isJoker(card))!;
    game = applyAction(game, { type: "play", player: leader, card: lead });

    const responder = game.turn as PlayerId;
    const hand = game.hands[responder];
    const legal = legalPlays(hand, game.currentTrick);
    const illegal = hand.find((card) => !legal.some((l) => l.id === card.id));
    if (illegal) {
      expect(() =>
        applyAction(game, { type: "play", player: responder, card: illegal }),
      ).toThrow(/масть/);
    }
  });

  it("не даёт положить джокера без объявления", () => {
    let game = createGame({ seed: 31337, dealer: 0 });
    let guard = 0;
    while (guard < 50000) {
      guard += 1;
      if (game.phase === "playing") {
        const player = game.turn as PlayerId;
        const jokerCard = game.hands[player].find(isJoker);
        if (
          jokerCard &&
          isLegalPlay(jokerCard, game.hands[player], game.currentTrick)
        ) {
          expect(() =>
            applyAction(game, { type: "play", player, card: jokerCard }),
          ).toThrow(/объяв/);
          return;
        }
      }
      if (game.phase === "game-over") break;
      game = stepAutomatically(game);
    }
    throw new Error("В партии не нашлось момента с джокером на руках");
  });

  it("не даёт перейти к следующей строке, пока раздача не закрыта", () => {
    const game = createGame({ seed: 12, dealer: 0 });
    expect(() => applyAction(game, { type: "next-row" })).toThrow(/не закрыта/);
    expect(() => applyAction(game, { type: "collect-trick" })).toThrow(
      /не доиграна/,
    );
  });
});

describe("последняя взятка", () => {
  it("хранится ровно одна — только что доигранная", () => {
    let game = createGame({ seed: 555, dealer: 0 });
    while ((currentHandRow(game)?.cards ?? 0) < 3) {
      game = stepAutomatically(game);
    }
    let seen = 0;
    while (game.phase !== "hand-complete") {
      const before = game.lastTrick;
      game = stepAutomatically(game);
      if (game.lastTrick !== before && game.lastTrick) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
    expect(game.lastTrick?.plays).toHaveLength(4);
  });
});

describe("джокеры в протоколе", () => {
  it("записывает, сколько джокеров было у каждого игрока на руках в раздаче", () => {
    let game = createGame({ seed: 77, dealer: 0 });
    const dealt = PLAYER_IDS.map((p) => game.hands[p].filter(isJoker).length);
    expect(game.dealtJokers).toEqual(dealt);

    let guard = 0;
    while (game.phase !== "hand-complete" && guard < 500) {
      guard += 1;
      game = stepAutomatically(game);
    }
    expect(game.results[0].jokers).toEqual(dealt);
  });

  it("за партию у игрока бывает 0, 1 или 2 джокера, а в раздаче всего не больше двух", () => {
    const finished = playToEnd(createGame({ seed: 20260824, dealer: 0 }));
    expect(finished.results).toHaveLength(TOTAL_HANDS);
    for (const result of finished.results) {
      for (const count of result.jokers) expect([0, 1, 2]).toContain(count);
      expect(result.jokers.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2);
    }
    expect(finished.results.some((r) => r.jokers.some((n) => n > 0))).toBe(
      true,
    );
  });

  it("попадает в строки протокола", () => {
    const finished = playToEnd(createGame({ seed: 20260824, dealer: 0 }));
    const rows = buildScoreboard(finished.results, finished.premiums);
    for (const row of rows.filter((r) => r.type === "hand")) {
      const result = finished.results.find(
        (r) => r.handIndex === row.handIndex,
      )!;
      expect(row.cells.map((cell) => cell.jokers)).toEqual(result.jokers);
    }
  });
});

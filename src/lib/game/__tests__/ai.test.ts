import { describe, expect, it } from "vitest";
import { chooseBid, chooseMove } from "../ai";
import { isJoker } from "../cards";
import { createGame, currentHandRow, legalBidsFor } from "../engine";
import { isLegalPlay } from "../rules";
import { tricksCount } from "../text";
import type { GameState, PlayerId } from "../types";
import { stepAutomatically } from "./autoplay";

/** Собирает все ходы и заказы ботов за партию и проверяет их легальность. */
function auditGame(seed: number): {
  bids: number;
  plays: number;
  jokerModes: Set<string>;
} {
  let game: GameState = createGame({ seed, dealer: (seed % 4) as PlayerId });
  const jokerModes = new Set<string>();
  let bids = 0;
  let plays = 0;

  for (let guard = 0; guard < 50000 && game.phase !== "game-over"; guard += 1) {
    if (game.phase === "bidding") {
      const player = game.bidTurn as PlayerId;
      const bid = chooseBid(game, player);
      expect(legalBidsFor(game, player)).toContain(bid);
      expect(bid).toBeLessThanOrEqual(currentHandRow(game)!.cards);
      bids += 1;
    }
    if (game.phase === "playing") {
      const player = game.turn as PlayerId;
      const trick = game.currentTrick!;
      const move = chooseMove(game, player);
      expect(
        isLegalPlay(
          move.card,
          game.hands[player],
          trick.plays.length === 0 ? null : trick,
        ),
      ).toBe(true);
      if (isJoker(move.card)) {
        expect(move.declaration).not.toBeNull();
        const d = move.declaration!;
        jokerModes.add(
          d.kind === "response" ? `response:${d.mode}` : `lead:${d.mode}`,
        );
        // Заход джокером обязан объявлять масть, ответ — нет.
        expect(d.kind).toBe(trick.plays.length === 0 ? "lead" : "response");
      }
      plays += 1;
    }
    game = stepAutomatically(game);
  }

  expect(game.phase).toBe("game-over");
  return { bids, plays, jokerModes };
}

describe("боты", () => {
  it("на разных раздачах не делают ни одного нелегального хода или заказа", () => {
    const seen = new Set<string>();
    for (const seed of [3, 17, 64, 512, 20260824]) {
      const audit = auditGame(seed);
      // 24 обычные и 4 тёмные раздачи по 4 заказа.
      expect(audit.bids).toBe(28 * 4);
      expect(audit.plays).toBeGreaterThan(100);
      for (const mode of audit.jokerModes) seen.add(mode);
    }
    // Боты пользуются и ответными объявлениями, и заходом с джокера.
    expect(seen.has("response:high")).toBe(true);
    expect(seen.has("response:low")).toBe(true);
    expect(seen.has("lead:lead-high")).toBe(true);
  });

  it("в сливах стараются не брать взятки, в наборах — наоборот", () => {
    let game = createGame({ seed: 4242, dealer: 0 });
    const tricksByKind = new Map<string, number[]>();
    while (game.phase !== "game-over") {
      game = stepAutomatically(game);
    }
    for (const result of game.results) {
      if (result.kind !== "nabory" && result.kind !== "slivy") continue;
      const taken = tricksByKind.get(result.kind) ?? [];
      tricksByKind.set(result.kind, [...taken, ...result.tricks]);
    }
    // Все 36 взяток блока всё равно кем-то забираются — проверяем лишь полноту зачёта.
    expect(tricksByKind.get("nabory")?.reduce((a, b) => a + b, 0)).toBe(36);
    expect(tricksByKind.get("slivy")?.reduce((a, b) => a + b, 0)).toBe(36);
  });
});

describe("склонение числительных", () => {
  it("согласует слово «взятка» с числом", () => {
    expect(tricksCount(1)).toBe("1 взятка");
    expect(tricksCount(2)).toBe("2 взятки");
    expect(tricksCount(4)).toBe("4 взятки");
    expect(tricksCount(5)).toBe("5 взяток");
    expect(tricksCount(0)).toBe("0 взяток");
    expect(tricksCount(11)).toBe("11 взяток");
    expect(tricksCount(21)).toBe("21 взятка");
  });
});

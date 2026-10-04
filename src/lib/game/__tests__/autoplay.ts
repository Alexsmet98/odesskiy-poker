import { chooseBid, chooseMove } from "../ai";
import { applyAction } from "../engine";
import type { GameState, PlayerId } from "../types";

/** Один автоматический шаг партии: за кого бы ни был ход, выбирается легальное действие. */
export function stepAutomatically(state: GameState): GameState {
  switch (state.phase) {
    case "bidding": {
      const player = state.bidTurn as PlayerId;
      return applyAction(state, { type: "bid", player, value: chooseBid(state, player) });
    }
    case "playing": {
      const player = state.turn as PlayerId;
      const move = chooseMove(state, player);
      return applyAction(state, {
        type: "play",
        player,
        card: move.card,
        declaration: move.declaration,
      });
    }
    case "trick-complete":
      return applyAction(state, { type: "collect-trick" });
    case "hand-complete":
    case "premium":
      return applyAction(state, { type: "next-row" });
    case "game-over":
      return state;
  }
}

/** Прокручивает партию до начала нужной строки протокола. */
export function fastForwardToRow(state: GameState, targetRow: number): GameState {
  let game = state;
  for (let guard = 0; guard < 50000; guard += 1) {
    if (
      game.rowIndex + 1 === targetRow &&
      (game.phase === "bidding" || game.phase === "playing")
    ) {
      return game;
    }
    if (game.phase === "game-over") break;
    game = stepAutomatically(game);
  }
  throw new Error(`Не удалось дойти до строки ${targetRow}`);
}

/** Доигрывает партию до конца. */
export function playToEnd(state: GameState): GameState {
  let game = state;
  for (let guard = 0; guard < 50000; guard += 1) {
    if (game.phase === "game-over") return game;
    game = stepAutomatically(game);
  }
  throw new Error("Партия не завершилась за отведённое число шагов");
}

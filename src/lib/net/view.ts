import type { Card } from "@/lib/game/cards";
import type { GameState, PlayerId } from "@/lib/game/types";

/** Одинаковая «рубашка» для чужих карт: по ней ничего не узнать, кроме числа карт. */
function hiddenCard(seat: PlayerId, index: number): Card {
  return {
    kind: "suit",
    id: `hidden-${seat}-${index}`,
    suit: "spades",
    rank: 6,
  };
}

/**
 * Состояние партии глазами одного игрока. Чужие руки заменяются рубашками,
 * зерно тасовки и число джокеров в текущих руках убираются — по ним можно
 * восстановить раздачу. Остальное (взятки на столе, заказы, журнал, результаты) публично.
 */
export function maskStateFor(state: GameState, seat: PlayerId): GameState {
  return {
    ...state,
    seed: 0,
    rngCursor: 0,
    dealtJokers: state.dealtJokers.map(() => 0),
    players: state.players.map((p) => ({ ...p, isHuman: p.id === seat })),
    hands: state.hands.map((hand, owner) =>
      owner === seat
        ? hand
        : hand.map((_, i) => hiddenCard(owner as PlayerId, i)),
    ),
  };
}

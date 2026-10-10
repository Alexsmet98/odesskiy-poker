import type { Card } from "@/lib/game/cards";
import {
  activePlayer,
  currentHandRow,
  currentRow,
  legalBidsFor,
  settlement,
} from "@/lib/game/engine";
import { legalPlays } from "@/lib/game/rules";
import type {
  GameState,
  JokerDeclaration,
  PlayerId,
  ResultEdit,
} from "@/lib/game/types";

/** Всё, что нужно столу от источника партии: локального движка или сетевого лобби. */
export type GameController = {
  state: GameState;
  /** Место, за которым сидит этот игрок. */
  human: PlayerId;
  row: ReturnType<typeof currentRow>;
  handRow: ReturnType<typeof currentHandRow>;
  acting: PlayerId | null;
  waitingForHuman: boolean;
  humanLegalBids: number[];
  humanLegalCards: Card[];
  settlement: ReturnType<typeof settlement>;
  error: string | null;
  placeBid: (value: number) => void;
  playCard: (card: Card, declaration?: JokerDeclaration | null) => void;
  nextRow: () => void;
  /** Правка протокола доступна хозяину сетевого лобби. */
  editResult?: (edit: ResultEdit) => void;
  /** Кнопка в шапке: в одиночной игре «Заново», в сети — выход из-за стола. */
  exitLabel: string;
  /** Кнопка после окончания партии. */
  finishLabel: string;
  exit: () => void;
  /**
   * Предложение победителю занести партию в журнал.
   * Есть только в сетевой игре, где все четверо — люди.
   */
  journalOffer?: {
    recorded: boolean;
    tied: boolean;
    busy: boolean;
    error: string | null;
    save: () => void;
  };
};

export function deriveView(state: GameState, human: PlayerId) {
  const acting = activePlayer(state);
  const waitingForHuman = acting === human;
  const humanLegalBids =
    state.phase === "bidding" ? legalBidsFor(state, human) : [];
  const humanLegalCards =
    state.phase === "playing" && waitingForHuman && state.currentTrick
      ? legalPlays(
          state.hands[human],
          state.currentTrick.plays.length === 0 ? null : state.currentTrick,
        )
      : [];
  return {
    row: currentRow(state),
    handRow: currentHandRow(state),
    acting,
    waitingForHuman,
    humanLegalBids,
    humanLegalCards,
    settlement: settlement(state),
  };
}

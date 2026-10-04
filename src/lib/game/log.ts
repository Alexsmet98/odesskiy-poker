import type { GameState, LogEntry } from "./types";

/**
 * Журнал стола без истории старых взяток: ходы показываются только текущей
 * и предыдущей взятки. Заказы и итоги раздач остаются на виду.
 */
export function visibleLog(state: GameState): LogEntry[] {
  const row = state.log.length > 0 ? state.log[state.log.length - 1].row : null;
  return state.log.filter((entry) => {
    if (entry.trick === undefined) return true;
    if (entry.row !== row) return false;
    return entry.trick >= state.trickNumber - 1;
  });
}

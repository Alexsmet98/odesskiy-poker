import type {
  GameState,
  JokerDeclaration,
  PlayerId,
  ResultEdit,
} from "@/lib/game/types";

export const LOBBY_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 20;

export type LobbyStatus = "waiting" | "playing";

export type SeatInfo = {
  seat: PlayerId;
  kind: "human" | "bot" | "empty";
  name: string | null;
  connected: boolean;
};

export type LobbySnapshot = {
  code: string;
  status: LobbyStatus;
  hostSeat: PlayerId;
  mySeat: PlayerId;
  seats: SeatInfo[];
};

/** Что сервер присылает игроку: состояние лобби и партия, из которой вырезано всё чужое. */
export type ServerEvent = {
  lobby: LobbySnapshot;
  game: GameState | null;
};

export type NetAction =
  | { type: "bid"; value: number }
  | { type: "play"; cardId: string; declaration: JokerDeclaration | null }
  /** rowIndex защищает от двойного перехода, если «Дальше» нажали сразу двое. */
  | { type: "next-row"; rowIndex: number }
  /** Правка протокола — только у хозяина лобби. */
  | ({ type: "edit-result" } & ResultEdit);

export type LobbyInfo = {
  code: string;
  status: LobbyStatus;
  freeSeats: number;
};

export type JoinResult = { code: string; token: string; seat: PlayerId };

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

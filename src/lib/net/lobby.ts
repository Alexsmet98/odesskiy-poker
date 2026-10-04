import { randomInt, randomUUID } from "node:crypto";
import { aiDelay, chooseBid, chooseMove } from "@/lib/game/ai";
import {
  activePlayer,
  applyAction,
  createGame,
  DEFAULT_PLAYERS,
} from "@/lib/game/engine";
import {
  PLAYER_IDS,
  type GameState,
  type Player,
  type PlayerId,
} from "@/lib/game/types";
import {
  LOBBY_CODE_LENGTH,
  MAX_NAME_LENGTH,
  normalizeCode,
  type JoinResult,
  type LobbyInfo,
  type LobbySnapshot,
  type LobbyStatus,
  type NetAction,
  type SeatInfo,
  type ServerEvent,
} from "./protocol";
import { maskStateFor } from "./view";

export const TRICK_PAUSE_MS = 1500;
export const POLL_WAIT_MS = 20_000;
/** Сколько игрок считается «на месте» после последнего запроса long-poll. */
export const POLL_LEASE_MS = 10_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_LOBBIES = 200;
const IDLE_LOBBY_MS = 6 * 60 * 60 * 1000;

export class LobbyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LobbyError";
  }
}

/** Не `instanceof`: менеджер живёт в globalThis и переживает перезагрузку модулей. */
export function isLobbyError(error: unknown): error is LobbyError {
  return (
    error instanceof Error &&
    error.name === "LobbyError" &&
    typeof (error as LobbyError).status === "number"
  );
}

type Listener = (event: ServerEvent) => void;

type SeatData =
  | { kind: "empty" }
  | { kind: "human"; name: string; token: string }
  | { kind: "bot"; name: string };

type Lobby = {
  code: string;
  status: LobbyStatus;
  hostSeat: PlayerId;
  seats: SeatData[];
  listeners: Map<PlayerId, Set<Listener>>;
  leases: Map<PlayerId, { listener: Listener; timer: unknown }>;
  version: number;
  game: GameState | null;
  timer: unknown;
  touchedAt: number;
};

export type Scheduler = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw new LobbyError("Назовите себя", 400);
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0) throw new LobbyError("Назовите себя", 400);
  if (name.length > MAX_NAME_LENGTH) {
    throw new LobbyError(`Имя длиннее ${MAX_NAME_LENGTH} символов`, 400);
  }
  return name;
}

/**
 * Лобби живут в памяти процесса: код комнаты, места, партия и таймеры ботов.
 * Партию ведёт сервер, клиенты шлют только свои заказы и ходы и получают состояние,
 * из которого вырезаны чужие карты.
 */
export class LobbyManager {
  private lobbies = new Map<string, Lobby>();

  constructor(
    private readonly scheduler: Scheduler = defaultScheduler,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.lobbies.size;
  }

  create(rawName: unknown): JoinResult {
    const name = cleanName(rawName);
    this.sweep();
    if (this.lobbies.size >= MAX_LOBBIES) {
      throw new LobbyError("Сейчас слишком много лобби, зайдите позже", 503);
    }
    const code = this.freshCode();
    const token = randomUUID();
    const lobby: Lobby = {
      code,
      status: "waiting",
      hostSeat: 0,
      seats: [
        { kind: "human", name, token },
        { kind: "empty" },
        { kind: "empty" },
        { kind: "empty" },
      ],
      listeners: new Map(),
      leases: new Map(),
      version: 0,
      game: null,
      timer: null,
      touchedAt: this.now(),
    };
    this.lobbies.set(code, lobby);
    return { code, token, seat: 0 };
  }

  info(rawCode: string): LobbyInfo {
    const lobby = this.requireLobby(rawCode);
    return {
      code: lobby.code,
      status: lobby.status,
      freeSeats: lobby.seats.filter((s) => s.kind === "empty").length,
    };
  }

  join(rawCode: string, rawName: unknown): JoinResult {
    const lobby = this.requireLobby(rawCode);
    const name = cleanName(rawName);
    if (lobby.status !== "waiting")
      throw new LobbyError("Игра в этом лобби уже идёт", 409);
    const taken = lobby.seats.some(
      (s) => s.kind === "human" && s.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken)
      throw new LobbyError(
        "Такое имя за столом уже есть, возьмите другое",
        409,
      );
    const seat = lobby.seats.findIndex((s) => s.kind === "empty");
    if (seat === -1) throw new LobbyError("За столом нет свободных мест", 409);
    const token = randomUUID();
    lobby.seats[seat] = { kind: "human", name, token };
    this.touch(lobby);
    this.broadcast(lobby);
    return { code: lobby.code, token, seat: seat as PlayerId };
  }

  /** Хозяин начинает партию; пустые места занимают боты. */
  start(rawCode: string, token: string): void {
    const lobby = this.requireLobby(rawCode);
    const seat = this.requireSeat(lobby, token);
    if (seat !== lobby.hostSeat)
      throw new LobbyError("Начать партию может только хозяин лобби", 403);
    if (lobby.status !== "waiting")
      throw new LobbyError("Партия уже идёт", 409);

    const used = new Set(
      lobby.seats.flatMap((s) => (s.kind === "human" ? [s.name] : [])),
    );
    const botNames = DEFAULT_PLAYERS.slice(1).map((p) => p.name);
    lobby.seats = lobby.seats.map((s) => {
      if (s.kind !== "empty") return s;
      const name = botNames.find((n) => !used.has(n)) ?? `Бот ${used.size}`;
      used.add(name);
      return { kind: "bot", name };
    });

    const players: Player[] = lobby.seats.map((s, i) => {
      const name = s.kind === "empty" ? "" : s.name;
      const tagline =
        s.kind === "bot"
          ? (DEFAULT_PLAYERS.find((p) => p.name === name)?.tagline ??
            "играет за столом")
          : "живой игрок";
      return { id: i as PlayerId, name, isHuman: false, tagline };
    });

    lobby.game = createGame({ players });
    lobby.status = "playing";
    this.touch(lobby);
    this.broadcast(lobby);
    this.schedule(lobby);
  }

  act(rawCode: string, token: string, action: NetAction): void {
    const lobby = this.requireLobby(rawCode);
    const seat = this.requireSeat(lobby, token);
    const game = lobby.game;
    if (lobby.status !== "playing" || !game)
      throw new LobbyError("Партия ещё не началась", 409);

    try {
      let next: GameState;
      switch (action.type) {
        case "bid":
          if (!Number.isInteger(action.value))
            throw new Error("Заказ должен быть целым числом");
          next = applyAction(game, {
            type: "bid",
            player: seat,
            value: action.value,
          });
          break;
        case "play": {
          const card = game.hands[seat].find((c) => c.id === action.cardId);
          if (!card) throw new Error("Этой карты нет на руках");
          next = applyAction(game, {
            type: "play",
            player: seat,
            card,
            declaration: action.declaration ?? null,
          });
          break;
        }
        case "next-row":
          if (
            action.rowIndex !== game.rowIndex ||
            (game.phase !== "hand-complete" && game.phase !== "premium")
          ) {
            return;
          }
          next = applyAction(game, { type: "next-row" });
          break;
        default:
          throw new Error("Неизвестное действие");
      }
      lobby.game = next;
    } catch (e) {
      throw new LobbyError(
        e instanceof Error ? e.message : "Непонятный ход",
        400,
      );
    }

    this.touch(lobby);
    this.broadcast(lobby);
    this.schedule(lobby);
  }

  /**
   * Выход из лобби. До начала место освобождается, во время партии за игрока
   * садится бот, чтобы остальные доиграли.
   */
  leave(rawCode: string, token: string): void {
    const lobby = this.requireLobby(rawCode);
    const seat = this.requireSeat(lobby, token);
    const name = (lobby.seats[seat] as { name: string }).name;

    if (lobby.status === "waiting") {
      lobby.seats[seat] = { kind: "empty" };
    } else {
      lobby.seats[seat] = { kind: "bot", name };
    }
    this.closeListeners(lobby, seat);

    const humans = PLAYER_IDS.filter((p) => lobby.seats[p].kind === "human");
    if (humans.length === 0) {
      this.dispose(lobby);
      return;
    }
    if (lobby.hostSeat === seat) lobby.hostSeat = humans[0];
    this.touch(lobby);
    this.broadcast(lobby);
    this.schedule(lobby);
  }

  /** Подписка на события; сразу присылает текущее состояние. Возвращает отписку. */
  subscribe(rawCode: string, token: string, listener: Listener): () => void {
    const lobby = this.requireLobby(rawCode);
    const seat = this.requireSeat(lobby, token);
    const set = lobby.listeners.get(seat) ?? new Set<Listener>();
    set.add(listener);
    lobby.listeners.set(seat, set);
    this.broadcast(lobby);
    this.schedule(lobby);

    return () => {
      const current = this.lobbies.get(lobby.code);
      if (!current) return;
      current.listeners.get(seat)?.delete(listener);
      this.touch(current);
      this.broadcast(current);
      this.schedule(current);
    };
  }

  /**
   * Запасной канал, когда SSE не доходит (прокси и туннели буферизуют поток):
   * long-poll. Отвечает сразу, если у клиента устаревшая версия, иначе ждёт
   * следующего изменения до `waitMs` и тогда отвечает `null`.
   */
  poll(
    rawCode: string,
    token: string,
    since: number,
    waitMs: number = POLL_WAIT_MS,
  ): Promise<{ version: number; event: ServerEvent } | null> {
    const lobby = this.requireLobby(rawCode);
    const seat = this.requireSeat(lobby, token);
    this.hold(lobby, seat);
    if (lobby.version !== since) {
      return Promise.resolve({
        version: lobby.version,
        event: this.eventFor(lobby, seat),
      });
    }

    return new Promise((resolve) => {
      const set = lobby.listeners.get(seat) ?? new Set<Listener>();
      lobby.listeners.set(seat, set);
      const finish = (changed: boolean) => {
        this.scheduler.clear(timer);
        set.delete(listener);
        resolve(
          changed
            ? { version: lobby.version, event: this.eventFor(lobby, seat) }
            : null,
        );
      };
      const listener: Listener = () => finish(true);
      const timer = this.scheduler.set(() => finish(false), waitMs);
      set.add(listener);
    });
  }

  /** Состояние для тестов и отладки: что видит конкретный игрок. */
  viewFor(rawCode: string, token: string): ServerEvent {
    const lobby = this.requireLobby(rawCode);
    return this.eventFor(lobby, this.requireSeat(lobby, token));
  }

  /** Пока клиент опрашивает лобби, он «на месте»: между запросами держим аренду. */
  private hold(lobby: Lobby, seat: PlayerId): void {
    let lease = lobby.leases.get(seat);
    const created = !lease;
    if (lease) {
      this.scheduler.clear(lease.timer);
    } else {
      lease = { listener: () => {}, timer: null };
      lobby.leases.set(seat, lease);
      const set = lobby.listeners.get(seat) ?? new Set<Listener>();
      set.add(lease.listener);
      lobby.listeners.set(seat, set);
    }
    const held = lease;
    held.timer = this.scheduler.set(() => {
      const current = this.lobbies.get(lobby.code);
      if (!current || current.leases.get(seat) !== held) return;
      current.leases.delete(seat);
      current.listeners.get(seat)?.delete(held.listener);
      this.touch(current);
      this.broadcast(current);
      this.schedule(current);
    }, POLL_LEASE_MS);
    if (created) {
      this.broadcast(lobby);
      this.schedule(lobby);
    }
  }

  private requireLobby(rawCode: string): Lobby {
    const lobby = this.lobbies.get(normalizeCode(rawCode));
    if (!lobby) throw new LobbyError("Лобби с таким кодом не найдено", 404);
    return lobby;
  }

  private requireSeat(lobby: Lobby, token: string): PlayerId {
    const seat = lobby.seats.findIndex(
      (s) => s.kind === "human" && s.token === token,
    );
    if (seat === -1) throw new LobbyError("Вы не сидите за этим столом", 403);
    return seat as PlayerId;
  }

  private touch(lobby: Lobby): void {
    lobby.touchedAt = this.now();
  }

  private freshCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = "";
      for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!this.lobbies.has(code)) return code;
    }
    throw new LobbyError("Не удалось выдать код лобби", 503);
  }

  private sweep(): void {
    const limit = this.now() - IDLE_LOBBY_MS;
    for (const lobby of [...this.lobbies.values()]) {
      const watched = [...lobby.listeners.values()].some((set) => set.size > 0);
      if (!watched && lobby.touchedAt < limit) this.dispose(lobby);
    }
  }

  private dispose(lobby: Lobby): void {
    if (lobby.timer !== null) this.scheduler.clear(lobby.timer);
    lobby.timer = null;
    for (const set of lobby.listeners.values()) set.clear();
    for (const lease of lobby.leases.values())
      this.scheduler.clear(lease.timer);
    lobby.leases.clear();
    this.lobbies.delete(lobby.code);
  }

  private closeListeners(lobby: Lobby, seat: PlayerId): void {
    lobby.listeners.get(seat)?.clear();
    const lease = lobby.leases.get(seat);
    if (lease) this.scheduler.clear(lease.timer);
    lobby.leases.delete(seat);
  }

  private snapshotFor(lobby: Lobby, mySeat: PlayerId): LobbySnapshot {
    const seats: SeatInfo[] = PLAYER_IDS.map((seat) => {
      const data = lobby.seats[seat];
      return {
        seat,
        kind: data.kind,
        name: data.kind === "empty" ? null : data.name,
        connected:
          data.kind === "human" && (lobby.listeners.get(seat)?.size ?? 0) > 0,
      };
    });
    return {
      code: lobby.code,
      status: lobby.status,
      hostSeat: lobby.hostSeat,
      mySeat,
      seats,
    };
  }

  private eventFor(lobby: Lobby, seat: PlayerId): ServerEvent {
    return {
      lobby: this.snapshotFor(lobby, seat),
      game: lobby.game ? maskStateFor(lobby.game, seat) : null,
    };
  }

  private broadcast(lobby: Lobby): void {
    lobby.version += 1;
    for (const [seat, listeners] of lobby.listeners) {
      if (listeners.size === 0) continue;
      const event = this.eventFor(lobby, seat);
      for (const listener of [...listeners]) listener(event);
    }
  }

  private hasConnectedHuman(lobby: Lobby): boolean {
    return PLAYER_IDS.some(
      (seat) =>
        lobby.seats[seat].kind === "human" &&
        (lobby.listeners.get(seat)?.size ?? 0) > 0,
    );
  }

  /** Ходы ботов и сбор взятки идут сами, с паузой — пока за столом есть кто смотрит. */
  private schedule(lobby: Lobby): void {
    if (lobby.timer !== null) {
      this.scheduler.clear(lobby.timer);
      lobby.timer = null;
    }
    const game = lobby.game;
    if (lobby.status !== "playing" || !game || !this.hasConnectedHuman(lobby))
      return;

    if (game.phase === "trick-complete") {
      lobby.timer = this.scheduler.set(
        () =>
          this.advance(lobby, (g) => applyAction(g, { type: "collect-trick" })),
        TRICK_PAUSE_MS,
      );
      return;
    }

    const acting = activePlayer(game);
    if (acting === null || lobby.seats[acting].kind !== "bot") return;

    lobby.timer = this.scheduler.set(
      () =>
        this.advance(lobby, (g) => {
          if (activePlayer(g) !== acting) return g;
          if (g.phase === "bidding") {
            return applyAction(g, {
              type: "bid",
              player: acting,
              value: chooseBid(g, acting),
            });
          }
          const move = chooseMove(g, acting);
          return applyAction(g, {
            type: "play",
            player: acting,
            card: move.card,
            declaration: move.declaration,
          });
        }),
      aiDelay(game),
    );
  }

  private advance(lobby: Lobby, step: (game: GameState) => GameState): void {
    lobby.timer = null;
    if (!lobby.game || !this.lobbies.has(lobby.code)) return;
    lobby.game = step(lobby.game);
    this.touch(lobby);
    this.broadcast(lobby);
    this.schedule(lobby);
  }
}

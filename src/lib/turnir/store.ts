import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import seedData from "./seed.json";

const MAX_NAME_LENGTH = 40;
const MAX_PLAYERS = 20;
const SCORE_LIMIT = 1_000_000;

export type TurnirScore = { name: string; points: number; jokers: number };
export type TurnirGame = { id: number; date: string; players: TurnirScore[] };
export type TurnirDb = { players: { name: string }[]; games: TurnirGame[] };

export class TurnirError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TurnirError";
    this.status = status;
  }
}

export function turnirDataFile(): string {
  if (process.env.TURNIR_DATA_FILE) return process.env.TURNIR_DATA_FILE;
  return path.join(process.cwd(), "data", "turnir.json");
}

/** Журнал турнира: один JSON-файл, переживает перезапуск процесса. */
export class TurnirStore {
  constructor(
    private readonly file: string,
    private readonly seed: TurnirDb = seedData,
  ) {}

  listPlayers(): { name: string }[] {
    return this.load().players.map((player) => ({ name: player.name }));
  }

  addPlayer(rawName: unknown): void {
    const name = cleanName(rawName);
    const db = this.load();
    if (db.players.some((player) => sameName(player.name, name))) {
      throw new TurnirError("Такой игрок уже есть", 409);
    }
    db.players.push({ name });
    this.save(db);
  }

  deletePlayer(rawName: unknown): void {
    const name = cleanName(rawName);
    const db = this.load();
    db.players = db.players.filter((player) => !sameName(player.name, name));
    this.save(db);
  }

  listGames(): TurnirGame[] {
    return this.load().games.map(cloneGame);
  }

  addGame(raw: unknown): void {
    const game = cleanGame(raw);
    const db = this.load();
    if (db.games.some((item) => item.id === game.id)) {
      throw new TurnirError("Такая игра уже записана", 409);
    }
    for (const score of game.players) {
      if (!db.players.some((player) => sameName(player.name, score.name))) {
        throw new TurnirError(
          `Сначала добавьте игрока «${score.name}» в список`,
          400,
        );
      }
      const known = db.players.find((player) => sameName(player.name, score.name));
      if (known) score.name = known.name;
    }
    db.games.push(game);
    this.save(db);
  }

  /** Партия из лобби: недостающих игроков добавляет в список и пишет одну игру. */
  recordResult(raw: unknown): void {
    const game = cleanGame(raw);
    const db = this.load();
    if (db.games.some((item) => item.id === game.id)) {
      throw new TurnirError("Такая игра уже записана", 409);
    }
    for (const score of game.players) {
      const known = db.players.find((player) =>
        sameName(player.name, score.name),
      );
      if (known) score.name = known.name;
      else db.players.push({ name: score.name });
    }
    db.games.push(game);
    this.save(db);
  }

  deleteGame(rawId: unknown): void {
    const id = cleanId(rawId);
    const db = this.load();
    db.games = db.games.filter((game) => game.id !== id);
    this.save(db);
  }

  private load(): TurnirDb {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      if (!isDb(parsed)) throw new Error("bad shape");
      return parsed;
    } catch (error) {
      if (isMissingFile(error)) {
        const fresh = cloneDb(this.seed);
        this.save(fresh);
        return fresh;
      }
      throw new TurnirError("Журнал турнира повреждён", 500);
    }
  }

  private save(db: TurnirDb): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(db), "utf8");
    renameSync(tmp, this.file);
  }
}

let singleton: TurnirStore | null = null;

export function turnirStore(): TurnirStore {
  if (!singleton) singleton = new TurnirStore(turnirDataFile());
  return singleton;
}

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw new TurnirError("Введите имя", 400);
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new TurnirError("Введите имя", 400);
  if (name.length > MAX_NAME_LENGTH) {
    throw new TurnirError(`Имя длиннее ${MAX_NAME_LENGTH} символов`, 400);
  }
  if (/[\u0000-\u001f/\\]/.test(name)) {
    throw new TurnirError("В имени есть недопустимые символы", 400);
  }
  return name;
}

function cleanId(raw: unknown): number {
  const id = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TurnirError("Непонятный номер игры", 400);
  }
  return id;
}

function cleanScore(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > SCORE_LIMIT) {
    throw new TurnirError("Непонятные очки", 400);
  }
  return Math.trunc(value);
}

function cleanGame(raw: unknown): TurnirGame {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TurnirError("Не получилось прочитать игру", 400);
  }
  const body = raw as Record<string, unknown>;
  const id = cleanId(body.id);
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    throw new TurnirError("Укажите дату игры", 400);
  }
  if (!Array.isArray(body.players) || body.players.length < 2) {
    throw new TurnirError("Нужно минимум 2 игрока", 400);
  }
  if (body.players.length > MAX_PLAYERS) {
    throw new TurnirError(`За столом не больше ${MAX_PLAYERS} игроков`, 400);
  }
  const players = body.players.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TurnirError("Не получилось прочитать игрока", 400);
    }
    const score = item as Record<string, unknown>;
    return {
      name: cleanName(score.name),
      points: cleanScore(score.points),
      jokers: cleanScore(score.jokers),
    };
  });
  const names = players.map((player) => player.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new TurnirError("Игроки повторяются", 400);
  }
  return { id, date: body.date, players };
}

function sameName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isDb(value: unknown): value is TurnirDb {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Array.isArray(body.players) && Array.isArray(body.games);
}

function isMissingFile(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function cloneDb(db: TurnirDb): TurnirDb {
  return {
    players: db.players.map((player) => ({ name: player.name })),
    games: db.games.map(cloneGame),
  };
}

function cloneGame(game: TurnirGame): TurnirGame {
  return {
    id: game.id,
    date: game.date,
    players: game.players.map((player) => ({ ...player })),
  };
}

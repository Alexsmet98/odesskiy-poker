import {
  bearerToken,
  errorResponse,
  readJson,
  type CodeContext,
} from "@/lib/net/http";
import { LobbyError } from "@/lib/net/lobby";
import { SUITS } from "@/lib/game/cards";
import type { JokerDeclaration } from "@/lib/game/types";
import type { NetAction } from "@/lib/net/protocol";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

function parseDeclaration(raw: unknown): JokerDeclaration | null {
  if (raw === null || raw === undefined) return null;
  const bad = () => new LobbyError("Непонятное объявление джокера", 400);
  if (typeof raw !== "object") throw bad();
  const d = raw as Record<string, unknown>;
  if (d.kind === "response") {
    if (d.mode !== "high" && d.mode !== "low") throw bad();
    return { kind: "response", mode: d.mode };
  }
  if (d.kind === "lead") {
    const suit = SUITS.find((s) => s === d.suit);
    if (!suit) throw bad();
    if (
      d.mode === "lead-high" ||
      d.mode === "lead-low" ||
      d.mode === "demand-highest"
    ) {
      return { kind: "lead", mode: d.mode, suit };
    }
    if (
      d.mode === "dump" &&
      (d.target === "highest" || d.target === "lowest")
    ) {
      return { kind: "lead", mode: "dump", suit, target: d.target };
    }
  }
  throw bad();
}

function parseAction(raw: unknown): NetAction {
  if (!raw || typeof raw !== "object")
    throw new LobbyError("Нет действия", 400);
  const action = raw as Record<string, unknown>;
  switch (action.type) {
    case "bid":
      if (typeof action.value !== "number")
        throw new LobbyError("Нет заказа", 400);
      return { type: "bid", value: action.value };
    case "play":
      if (typeof action.cardId !== "string")
        throw new LobbyError("Нет карты", 400);
      return {
        type: "play",
        cardId: action.cardId,
        declaration: parseDeclaration(action.declaration),
      };
    case "next-row":
      if (typeof action.rowIndex !== "number")
        throw new LobbyError("Нет строки", 400);
      return { type: "next-row", rowIndex: action.rowIndex };
    default:
      throw new LobbyError("Неизвестное действие", 400);
  }
}

export async function POST(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    lobbyManager().act(code, bearerToken(request), parseAction(body.action));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

import { isLobbyError, LobbyError } from "./lobby";

export type CodeContext = { params: Promise<{ code: string }> };

export function errorResponse(error: unknown): Response {
  if (isLobbyError(error)) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: "Что-то пошло не так на сервере" },
    { status: 500 },
  );
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // тело не JSON — ниже ответим 400
  }
  throw new LobbyError("Не получилось прочитать запрос", 400);
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new LobbyError("Нужен токен игрока", 401);
  return match[1].trim();
}

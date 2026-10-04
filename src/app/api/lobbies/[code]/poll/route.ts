import { errorResponse, type CodeContext } from "@/lib/net/http";
import { LobbyError } from "@/lib/net/lobby";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Long-poll: запасной канал на случай, когда поток SSE не проходит через прокси или туннель. */
export async function GET(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) throw new LobbyError("Нужен токен игрока", 401);
    const since = Number(url.searchParams.get("v") ?? -1);

    const result = await lobbyManager().poll(
      code,
      token,
      Number.isFinite(since) ? since : -1,
    );
    return Response.json(result ?? { unchanged: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

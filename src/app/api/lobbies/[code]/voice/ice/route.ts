import { bearerToken, errorResponse, type CodeContext } from "@/lib/net/http";
import { iceServers } from "@/lib/net/ice";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

/** Краткоживущий допуск на TURN. Без секрета в окружении остаётся только STUN. */
export async function GET(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    lobbyManager().viewFor(code, bearerToken(request));
    return Response.json({ iceServers: iceServers() });
  } catch (error) {
    return errorResponse(error);
  }
}

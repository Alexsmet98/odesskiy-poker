import {
  bearerToken,
  errorResponse,
  readJson,
  type CodeContext,
} from "@/lib/net/http";
import { LobbyError } from "@/lib/net/lobby";
import { lobbyManager } from "@/lib/net/registry";
import { parseVoiceSignal } from "@/lib/net/voice";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
    const signals = lobbyManager().pullVoice(code, bearerToken(request), after);
    return Response.json({ signals });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    let signal;
    try {
      signal = parseVoiceSignal(body.signal);
    } catch (error) {
      throw new LobbyError(
        error instanceof Error ? error.message : "Непонятный сигнал",
        400,
      );
    }
    lobbyManager().postVoice(code, bearerToken(request), signal);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

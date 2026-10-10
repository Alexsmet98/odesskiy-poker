import { bearerToken, errorResponse, type CodeContext } from "@/lib/net/http";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
    const frames = lobbyManager().pullAudio(code, bearerToken(request), after);
    return Response.json({ frames });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const pcm = Buffer.from(await request.arrayBuffer());
    lobbyManager().postAudio(code, bearerToken(request), pcm);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

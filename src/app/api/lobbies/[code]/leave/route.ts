import { bearerToken, errorResponse, type CodeContext } from "@/lib/net/http";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    lobbyManager().leave(code, bearerToken(request));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, readJson, type CodeContext } from "@/lib/net/http";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    return Response.json(lobbyManager().join(code, body.name));
  } catch (error) {
    return errorResponse(error);
  }
}

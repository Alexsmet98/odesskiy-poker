import { errorResponse, type CodeContext } from "@/lib/net/http";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    return Response.json(lobbyManager().info(code));
  } catch (error) {
    return errorResponse(error);
  }
}

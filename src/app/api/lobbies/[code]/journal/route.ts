import { bearerToken, errorResponse, type CodeContext } from "@/lib/net/http";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    return Response.json(
      lobbyManager().recordJournal(code, bearerToken(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

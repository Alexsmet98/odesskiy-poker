import { errorResponse, readJson } from "@/lib/net/http";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    return Response.json(lobbyManager().create(body.name), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

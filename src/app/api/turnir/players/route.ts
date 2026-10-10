import { turnirStore } from "@/lib/turnir/store";
import { turnirErrorResponse } from "@/lib/turnir/http";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json(turnirStore().listPlayers());
  } catch (error) {
    return turnirErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const name =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { name?: unknown }).name
        : undefined;
    turnirStore().addPlayer(name);
    return new Response(null, { status: 201 });
  } catch (error) {
    return turnirErrorResponse(error);
  }
}

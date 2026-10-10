import { turnirErrorResponse } from "@/lib/turnir/http";
import { turnirStore } from "@/lib/turnir/store";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json(turnirStore().listGames());
  } catch (error) {
    return turnirErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    turnirStore().addGame(body);
    return new Response(null, { status: 201 });
  } catch (error) {
    return turnirErrorResponse(error);
  }
}

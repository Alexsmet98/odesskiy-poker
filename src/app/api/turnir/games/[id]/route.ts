import { turnirStore } from "@/lib/turnir/store";
import { turnirErrorResponse } from "@/lib/turnir/http";

export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    turnirStore().deleteGame(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return turnirErrorResponse(error);
  }
}

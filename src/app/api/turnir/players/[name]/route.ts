import { turnirStore } from "@/lib/turnir/store";
import { turnirErrorResponse } from "@/lib/turnir/http";

export const dynamic = "force-dynamic";

type NameContext = { params: Promise<{ name: string }> };

export async function DELETE(_request: Request, { params }: NameContext) {
  try {
    const { name } = await params;
    turnirStore().deletePlayer(name);
    return new Response(null, { status: 204 });
  } catch (error) {
    return turnirErrorResponse(error);
  }
}

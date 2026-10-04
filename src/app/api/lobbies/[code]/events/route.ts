import { errorResponse, type CodeContext } from "@/lib/net/http";
import { LobbyError } from "@/lib/net/lobby";
import { lobbyManager } from "@/lib/net/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEEPALIVE_MS = 15_000;

/** Поток Server-Sent Events: каждое событие — полный снимок лобби и партии для этого игрока. */
export async function GET(request: Request, { params }: CodeContext) {
  try {
    const { code } = await params;
    const token = new URL(request.url).searchParams.get("token");
    if (!token) throw new LobbyError("Нужен токен игрока", 401);

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };

        const unsubscribe = lobbyManager().subscribe(code, token, (event) => {
          send(`data: ${JSON.stringify(event)}\n\n`);
        });
        const keepalive = setInterval(() => send(": ping\n\n"), KEEPALIVE_MS);

        let closed = false;
        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(keepalive);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // поток уже закрыт клиентом
          }
        };
        request.signal.addEventListener("abort", cleanup);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

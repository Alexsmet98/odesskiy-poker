"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { Card } from "@/lib/game/cards";
import type { JokerDeclaration, ResultEdit } from "@/lib/game/types";
import { lobbyApi } from "@/lib/net/client";
import type { ServerEvent } from "@/lib/net/protocol";
import { clearSession, type Session } from "@/lib/net/session";
import { cn } from "@/lib/utils";
import { deriveView, type GameController } from "./controller";
import { GameTableView } from "./table-view";
import type { ConnectionStatus } from "./use-lobby";
import { VoiceSession } from "./voice-dock";

/** Партия по сети: ходы уходят на сервер, состояние приходит потоком. */
export function NetworkTable({
  code,
  session,
  event,
  connection,
}: {
  code: string;
  session: Session;
  event: ServerEvent;
  connection: ConnectionStatus;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<{
    message: string;
    at: ServerEvent;
  } | null>(null);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalSaved, setJournalSaved] = useState(false);
  const game = event.game;
  if (!game) throw new Error("Сетевой стол открыт без партии");

  // Ошибка живёт, пока не пришло следующее состояние: после него сообщение устарело.
  const error = failure && failure.at === event ? failure.message : null;

  const send = useCallback(
    (action: Parameters<typeof lobbyApi.act>[2]) => {
      lobbyApi.act(code, session.token, action).catch((e: unknown) => {
        setFailure({
          message: e instanceof Error ? e.message : "Ход не принят",
          at: event,
        });
      });
    },
    [code, event, session.token],
  );

  const exit = useCallback(() => {
    lobbyApi.leave(code, session.token).catch(() => {});
    clearSession(code);
    router.push("/");
  }, [code, router, session.token]);

  const saveJournal = useCallback(() => {
    setJournalBusy(true);
    setJournalError(null);
    lobbyApi.recordJournal(code, session.token).then(
      () => setJournalSaved(true),
      (e: unknown) =>
        setJournalError(e instanceof Error ? e.message : "Не записалось"),
    ).finally(() => setJournalBusy(false));
  }, [code, session.token]);

  const controller: GameController = useMemo(() => {
    const view = deriveView(game, event.lobby.mySeat);
    return {
      state: game,
      human: event.lobby.mySeat,
      ...view,
      error,
      placeBid: (value: number) => send({ type: "bid", value }),
      playCard: (card: Card, declaration: JokerDeclaration | null = null) =>
        send({ type: "play", cardId: card.id, declaration }),
      nextRow: () => send({ type: "next-row", rowIndex: game.rowIndex }),
      editResult:
        event.lobby.mySeat === event.lobby.hostSeat
          ? (edit: ResultEdit) => send({ type: "edit-result", ...edit })
          : undefined,
      exitLabel: "Выйти",
      finishLabel: "В меню",
      exit,
      journalOffer: journalOffer(
        event,
        game.phase,
        view.settlement.total,
        journalSaved,
        journalBusy,
        journalError,
        saveJournal,
      ),
    };
  },
    [
      error,
      event,
      exit,
      game,
      journalBusy,
      journalError,
      journalSaved,
      saveJournal,
      send,
    ],
  );

  const offline = event.lobby.seats.filter(
    (s) => s.kind === "human" && !s.connected && s.seat !== event.lobby.mySeat,
  );

  return (
    <VoiceSession
      code={code}
      token={session.token}
      mySeat={event.lobby.mySeat}
      seats={event.lobby.seats}
    >
    <GameTableView
      game={controller}
      headerExtra={
        <div className="flex items-center gap-2 text-xs">
          {offline.length > 0 && (
            <span className="hidden text-amber-300/80 sm:inline">
              не в сети: {offline.map((s) => s.name).join(", ")}
            </span>
          )}
          <span
            className={cn(
              "size-2 rounded-full",
              connection === "open"
                ? "bg-emerald-400"
                : "animate-pulse bg-amber-400",
            )}
            title={connection === "open" ? "Связь есть" : "Переподключаемся…"}
          />
          <span className="rounded border border-ember/40 px-1.5 py-0.5 font-mono tracking-widest text-ember">
            {event.lobby.code}
          </span>
        </div>
      }
    />
    </VoiceSession>
  );
}

function journalOffer(
  event: ServerEvent,
  phase: string,
  totals: number[],
  saved: boolean,
  busy: boolean,
  error: string | null,
  save: () => void,
): GameController["journalOffer"] {
  if (phase !== "game-over") return undefined;
  if (!event.lobby.seats.every((seat) => seat.kind === "human")) return undefined;
  const best = Math.max(...totals);
  if (totals[event.lobby.mySeat] !== best) return undefined;
  return {
    recorded: event.lobby.journalRecorded || saved,
    tied: totals.filter((value) => value === best).length > 1,
    busy,
    error,
    save,
  };
}

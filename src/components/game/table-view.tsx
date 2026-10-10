"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isJoker, type Card } from "@/lib/game/cards";
import { downloadProtocol } from "@/lib/game/protocol-export";
import { playRequirement } from "@/lib/game/rules";
import { SCHEDULE } from "@/lib/game/schedule";
import type { JokerDeclaration, PlayerId } from "@/lib/game/types";
import { ActionPanel } from "./action-panel";
import { JokerDialog } from "./joker-dialog";
import { PlayerSeat } from "./player-seat";
import { PlayingCard } from "./playing-card";
import { Scoreboard } from "./scoreboard";
import { TableCenter } from "./table-center";
import { TableLog } from "./table-log";
import type { GameController } from "./controller";

/** Стол для любого источника партии: локального движка или сетевого лобби. */
export function GameTableView({
  game,
  headerExtra,
}: {
  game: GameController;
  headerExtra?: ReactNode;
}) {
  const { state, human } = game;
  const opponents = [1, 2, 3].map(
    (offset) => ((human + offset) % 4) as PlayerId,
  );
  const [pendingJoker, setPendingJoker] = useState<Card | null>(null);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [lastTrickOpen, setLastTrickOpen] = useState(false);

  const hand = state.hands[human];
  const legalIds = new Set(game.humanLegalCards.map((c) => c.id));
  const canPlay = state.phase === "playing" && game.waitingForHuman;
  const isLead = (state.currentTrick?.plays.length ?? 0) === 0;
  const requirement = playRequirement(
    isLead ? null : (state.currentTrick ?? null),
  );
  const illegalTitle =
    requirement.kind === "highest-of"
      ? "Нельзя: нужно положить самую старшую карту масти"
      : requirement.kind === "lowest-of"
        ? "Нельзя: нужно положить самую младшую карту масти"
        : "Нельзя: нужно ходить в масть";

  const onCardClick = (card: Card) => {
    if (!canPlay || !legalIds.has(card.id)) return;
    if (isJoker(card)) {
      setPendingJoker(card);
      return;
    }
    game.playCard(card, null);
  };

  const onJokerConfirm = (declaration: JokerDeclaration) => {
    if (!pendingJoker) return;
    game.playCard(pendingJoker, declaration);
    setPendingJoker(null);
  };

  // Смотреть разрешено только последнюю взятку — её и показываем, пока новая пуста.
  const showingLastTrick =
    state.lastTrick !== null && (state.currentTrick?.plays.length ?? 0) === 0;
  const trick = showingLastTrick ? state.lastTrick : state.currentTrick;

  const centerTitle = (() => {
    if (state.phase === "game-over") return "Партия окончена";
    if (state.phase === "premium") return "Строка премии";
    if (state.phase === "hand-complete") return "Раздача сыграна";
    if (state.phase === "bidding") return "Торговля";
    if (showingLastTrick) return "Последняя взятка";
    return `Взятка ${state.trickNumber}`;
  })();

  const centerSubtitle = (() => {
    if (!game.handRow) return undefined;
    const { kind, cards } = game.handRow;
    if (kind === "dark") return `Тёмные · ${cards} карт`;
    if (kind === "nabory") return `Наборы · ${cards} карт · каждая взятка +20`;
    if (kind === "slivy") return `Сливы · ${cards} карт · каждая взятка −20`;
    return `${cards} карт на руках`;
  })();

  return (
    <div className="bar-grain lamp-glow relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-32 top-24 size-[36rem] animate-drift smoke-layer" />
      <div
        className="pointer-events-none absolute -right-40 bottom-10 size-[32rem] animate-drift smoke-layer"
        style={{ animationDelay: "-9s" }}
      />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-black/40 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <h1 className="animate-flicker font-heading text-xl tracking-[0.18em] text-ember uppercase sm:text-2xl">
            Одесский покер
          </h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            подвал у порта, лампа на одном проводе
          </span>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <span className="font-mono text-xs text-muted-foreground">
            строка {game.row.row} из {SCHEDULE.length}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={state.lastTrick === null}
            onClick={() => setLastTrickOpen(true)}
          >
            Последняя взятка
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setProtocolOpen(true)}
          >
            Протокол
          </Button>
          <Dialog open={lastTrickOpen} onOpenChange={setLastTrickOpen}>
            <DialogContent className="border-ember/30 bg-card sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl tracking-wide">
                  Последняя взятка
                </DialogTitle>
                <DialogDescription>
                  Смотреть можно только её — старые взятки уже не вернуть.
                </DialogDescription>
              </DialogHeader>
              <TableCenter
                state={state}
                trick={state.lastTrick}
                title="Последняя взятка"
              />
            </DialogContent>
          </Dialog>
          <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto border-ember/30 bg-card sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl tracking-wide">
                  Протокол партии
                </DialogTitle>
                <DialogDescription>
                  Как на бумаге: заказ и накопительный счёт по каждому игроку,
                  строки «Пр» — премии, внизу зачёт наборов и сливов.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadProtocol(state, game.settlement)}
                >
                  Скачать протокол
                </Button>
              </div>
              <Scoreboard
                state={state}
                settlement={game.settlement}
                currentRow={game.row.row}
                onEdit={game.editResult}
              />
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="sm" onClick={game.exit}>
            {game.exitLabel}
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-4 p-3 lg:flex-row lg:p-5">
        <main className="flex flex-1 flex-col items-center gap-4">
          <div className="grid w-full max-w-5xl grid-cols-3 items-start gap-2 sm:gap-4">
            {opponents.map((seatId) => (
              <PlayerSeat
                key={seatId}
                state={state}
                playerId={seatId}
                isActive={game.acting === seatId}
                showBid={
                  state.phase !== "bidding" || state.bids[seatId] !== null
                }
                compact
                className="w-full"
              />
            ))}
          </div>

          <div className="w-full max-w-3xl">
            <TableCenter
              state={state}
              trick={trick}
              title={centerTitle}
              subtitle={centerSubtitle}
            />
          </div>

          <ActionPanel game={game} />

          {game.error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-red-300">
              {game.error}
            </p>
          )}

          <div className="flex w-full max-w-5xl flex-col items-center gap-2">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Ваши карты</span>
              {state.dealer === human && (
                <span className="text-ember">вы сдаёте</span>
              )}
            </div>
            {hand.length === 0 ? (
              <p className="py-6 text-xs text-muted-foreground">
                {state.phase === "bidding"
                  ? "Карты ещё не сданы — тёмные торгуются вслепую."
                  : "Карты кончились."}
              </p>
            ) : (
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                {hand.map((card) => {
                  const playable = canPlay && legalIds.has(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => onCardClick(card)}
                      disabled={!playable}
                      title={canPlay && !playable ? illegalTitle : undefined}
                      className={cn(
                        "transition-transform duration-150",
                        playable
                          ? "cursor-pointer hover:-translate-y-2 focus-visible:-translate-y-2 focus-visible:outline-2 focus-visible:outline-ember"
                          : "cursor-not-allowed",
                      )}
                    >
                      <PlayingCard
                        card={card}
                        size="lg"
                        dimmed={canPlay && !playable}
                        className="sm:h-36 sm:w-24"
                      />
                    </button>
                  );
                })}
              </div>
            )}
            <PlayerSeat
              state={state}
              playerId={human}
              isActive={game.acting === human}
              showBid
              className="max-w-xs"
            />
          </div>
        </main>

        <aside className="w-full shrink-0 lg:w-80">
          <TableLog state={state} />
        </aside>
      </div>

      <JokerDialog
        open={pendingJoker !== null}
        isLead={isLead}
        onCancel={() => setPendingJoker(null)}
        onConfirm={onJokerConfirm}
      />
    </div>
  );
}

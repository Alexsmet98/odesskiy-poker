"use client";

import { Button } from "@/components/ui/button";
import { downloadProtocol } from "@/lib/game/protocol-export";
import { cn } from "@/lib/utils";
import {
  SUIT_LABEL,
  SUIT_LABEL_ACCUSATIVE,
  SUIT_SYMBOL,
} from "@/lib/game/cards";
import { playRequirement, trickContext } from "@/lib/game/rules";
import { HAND_KIND_LABEL } from "@/lib/game/schedule";
import { tricksCount } from "@/lib/game/text";
import type { GameController } from "./use-game";

/** Подсказка, что именно сейчас обязан положить игрок. */
function requirementHint(game: GameController): string | null {
  const trick = game.state.currentTrick;
  if (!trick || trick.plays.length === 0)
    return "Вы заходите — можно любую карту.";
  const ctx = trickContext(trick);
  const requirement = playRequirement(trick);
  if (!ctx) return null;
  if (requirement.kind === "highest-of") {
    const why = ctx.mode === "dump" ? "Слив" : "Джокер старший";
    return `${why}: нужно положить самую старшую ${SUIT_LABEL_ACCUSATIVE[requirement.suit]} из вашей руки. Нет масти — любую карту. Джокера можно положить всегда.`;
  }
  if (requirement.kind === "lowest-of") {
    const why = ctx.mode === "dump" ? "Слив" : "Джокер младший";
    return `${why}: нужно положить самую младшую ${SUIT_LABEL_ACCUSATIVE[requirement.suit]} из вашей руки. Нет масти — любую карту. Джокера можно положить всегда.`;
  }
  return `Масть хода — ${SUIT_SYMBOL[ctx.suit]} ${SUIT_LABEL[ctx.suit]}. Нет её на руках — кладите любую. Джокера можно всегда.`;
}

export function ActionPanel({ game }: { game: GameController }) {
  const { state, handRow, human } = game;

  if (state.phase === "game-over") {
    const order = [...state.players].sort(
      (a, b) => game.settlement.total[b.id] - game.settlement.total[a.id],
    );
    return (
      <Panel>
        <p className="font-heading text-lg tracking-wide text-ember">
          Партия закрыта
        </p>
        <ol className="w-full space-y-1 text-sm">
          {order.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 pb-1 last:border-0"
            >
              <span className={cn(player.isHuman && "text-ember")}>
                {index + 1}. {player.name}
              </span>
              <span className="font-mono">
                {game.settlement.total[player.id]}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            onClick={() => downloadProtocol(state, game.settlement)}
          >
            Скачать протокол
          </Button>
          <Button onClick={game.exit}>{game.finishLabel}</Button>
        </div>
      </Panel>
    );
  }

  if (state.phase === "premium") {
    const premium = state.premiums.find((p) => p.row === game.row.row);
    const winners = state.players.filter(
      (p) => (premium?.points[p.id] ?? 0) > 0,
    );
    return (
      <Panel>
        <p className="font-heading text-lg tracking-wide text-ember">
          Премия за блок
        </p>
        {winners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Никто не прошёл блок без промаха — премия не начисляется.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {winners.map((player) => (
              <li key={player.id}>
                <span className={cn(player.isHuman && "text-ember")}>
                  {player.name}
                </span>
                {": "}
                <span className="font-mono">+{premium?.points[player.id]}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — все заказы блока точно в цель
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={game.nextRow}>Дальше</Button>
      </Panel>
    );
  }

  if (state.phase === "hand-complete") {
    const result = state.results.find(
      (r) => r.handIndex === handRow?.handIndex,
    );
    const isNs = result?.kind === "nabory" || result?.kind === "slivy";
    return (
      <Panel>
        <p className="font-heading text-lg tracking-wide text-ember">
          Раздача {handRow?.label} сыграна
        </p>
        <ul className="w-full space-y-1 text-sm">
          {state.players.map((player) => {
            const bid = result?.bids[player.id] ?? null;
            const tricks = result?.tricks[player.id] ?? 0;
            const points = result?.points[player.id] ?? 0;
            return (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 border-b border-white/5 pb-1 last:border-0"
              >
                <span className={cn(player.isHuman && "text-ember")}>
                  {player.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {isNs
                    ? `${tricksCount(tricks)} в зачёт НС`
                    : `заказ ${bid ?? "—"} / взял ${tricks}`}
                </span>
                {!isNs && (
                  <span
                    className={cn(
                      "w-12 text-right font-mono",
                      points > 0
                        ? "text-emerald-400"
                        : points < 0
                          ? "text-red-400"
                          : "",
                    )}
                  >
                    {points > 0 ? "+" : ""}
                    {points}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <Button onClick={game.nextRow}>Дальше</Button>
      </Panel>
    );
  }

  if (state.phase === "bidding") {
    if (!game.waitingForHuman) {
      return (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Торгуется {state.players[state.bidTurn ?? 0].name}…
          </p>
          {handRow && handRow.kind === "dark" && (
            <p className="text-xs text-amber-200/60">
              Тёмные: заказы делаются до сдачи, карт на руках ещё нет.
            </p>
          )}
        </Panel>
      );
    }

    const isDealer = state.dealer === human;
    const cards = handRow?.cards ?? 0;
    const placed = state.bids.reduce<number>((sum, b) => sum + (b ?? 0), 0);
    return (
      <Panel>
        <p className="font-heading text-lg tracking-wide text-ember">
          Ваш заказ
        </p>
        <p className="text-xs text-muted-foreground">
          {handRow?.kind === "dark"
            ? "Тёмные: заказ вслепую, карты ещё не сданы."
            : `Карт на руках: ${cards}. Сколько взяток берёте?`}
        </p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: cards + 1 }, (_, i) => i).map((value) => {
            const legal = game.humanLegalBids.includes(value);
            return (
              <Button
                key={value}
                size="sm"
                variant={legal ? "secondary" : "ghost"}
                disabled={!legal}
                onClick={() => game.placeBid(value)}
                className={cn(
                  "min-w-10 font-mono",
                  !legal && "line-through opacity-40",
                )}
                title={
                  legal
                    ? undefined
                    : "Нельзя: сдающий не может замкнуть сумму заказов на числе карт"
                }
              >
                {value === 0 ? "пас" : value}
              </Button>
            );
          })}
        </div>
        {isDealer && (
          <p className="text-[11px] text-amber-200/70">
            Вы сдаёте и торгуетесь последним: не сходимся — сумма заказов не
            должна стать {cards}. Уже заказано {placed}.
          </p>
        )}
      </Panel>
    );
  }

  if (state.phase === "trick-complete") {
    const winner = state.currentTrick?.winner;
    return (
      <Panel>
        <p className="font-heading text-lg tracking-wide text-ember">
          Взятку забрал{" "}
          {winner !== null && winner !== undefined
            ? state.players[winner].name
            : "—"}
        </p>
        <p className="text-xs text-muted-foreground">Следующий ход — за ним.</p>
      </Panel>
    );
  }

  if (!game.waitingForHuman) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          Ход {state.players[state.turn ?? 0].name}…
        </p>
        <p className="text-xs text-amber-200/50">
          {handRow ? HAND_KIND_LABEL[handRow.kind] : ""}
          {handRow && handRow.kind === "normal"
            ? `, ${handRow.cards} карт`
            : ""}
        </p>
      </Panel>
    );
  }

  const goal = (() => {
    if (!handRow) return null;
    if (handRow.kind === "nabory")
      return "Наборы: берите как можно больше взяток.";
    if (handRow.kind === "slivy") return "Сливы: каждая взятка — во вред.";
    const bid = state.bids[human] ?? 0;
    const taken = state.tricksWon[human];
    if (bid === 0)
      return `Вы пасовали. Взято ${taken} — пас держится, пока вы не берёте.`;
    const left = Math.max(0, bid - taken);
    return left === 0
      ? `Ваш заказ ${bid}, взято ${taken} — заказ выполнен, лишние взятки его сломают.`
      : `Ваш заказ ${bid}, взято ${taken}. Осталось набрать ${tricksCount(left)}.`;
  })();

  return (
    <Panel>
      <p className="font-heading text-lg tracking-wide text-ember">Ваш ход</p>
      {goal && <p className="text-xs text-muted-foreground">{goal}</p>}
      <p className="text-[11px] text-amber-200/70">{requirementHint(game)}</p>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-24 w-full max-w-xl flex-col items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-4 py-3 text-center backdrop-blur">
      {children}
    </div>
  );
}

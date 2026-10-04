"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { buildScoreboard, type Settlement } from "@/lib/game/scoring";
import { PLAYER_IDS, type GameState } from "@/lib/game/types";

function cellText(value: number | null): string {
  if (value === null) return "";
  return String(value);
}

/**
 * Протокол партии в том же виде, в каком его пишут на бумаге:
 * строка на раздачу, у каждого игрока колонка заказа и колонка накопительного счёта,
 * строки «Пр» для премий и итоговый зачёт наборов и сливов внизу.
 */
export function Scoreboard({
  state,
  settlement,
  currentRow,
}: {
  state: GameState;
  settlement: Settlement;
  currentRow: number;
}) {
  const rows = buildScoreboard(state.results, state.premiums);

  return (
    <div className="protocol-sheet overflow-hidden rounded-md border border-black/20 shadow-2xl">
      <table className="w-full border-collapse font-mono text-[11px] leading-tight sm:text-xs">
        <thead>
          <tr className="bg-black/[0.07]">
            <th className="w-10 border border-black/25 px-1 py-1.5 text-center font-semibold">
              №
            </th>
            {state.players.map((player) => (
              <th
                key={player.id}
                colSpan={2}
                className="border border-black/25 px-2 py-1.5 text-center font-semibold"
              >
                {player.name}
              </th>
            ))}
          </tr>
          <tr className="bg-black/[0.04] text-[9px] uppercase tracking-wide sm:text-[10px]">
            <th className="border border-black/25 px-1 py-1" />
            {state.players.map((player) => (
              <Fragment key={player.id}>
                <th className="w-10 border border-black/25 px-1 py-1 font-normal">заказ</th>
                <th className="w-14 border border-black/25 px-1 py-1 font-normal">счёт</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isPremium = row.type === "premium";
            const isNs = row.kind === "nabory" || row.kind === "slivy";
            return (
              <tr
                key={row.row}
                className={cn(
                  isPremium && "bg-zinc-500/25 font-semibold",
                  row.row === currentRow && "bg-amber-300/40",
                )}
              >
                <td className="border border-black/25 px-1 py-1 text-center">{row.label}</td>
                {PLAYER_IDS.map((playerId) => {
                  const cell = row.cells[playerId];
                  const left = isNs ? cell.tricks : isPremium ? cell.points || null : cell.bid;
                  return (
                    <Fragment key={`${row.row}-${playerId}`}>
                      <td className="border border-black/25 px-1 py-1 text-center">
                        {isPremium ? (
                          left ? (
                            <span className="text-blue-900">+{left}</span>
                          ) : (
                            <span className="text-black/30">~</span>
                          )
                        ) : (
                          <span
                            className={cn(
                              cell.exact && !isNs && "rounded-full bg-blue-900/10 px-1",
                            )}
                          >
                            {left === 0 && !isNs && row.played ? "—" : cellText(left)}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "border border-black/25 px-1 py-1 text-center",
                          cell.exact && !isPremium && !isNs && "font-semibold",
                        )}
                      >
                        {cellText(cell.runningTotal)}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}

          <SummaryRow label="ОН" values={settlement.on} hint="взятки в наборах" />
          <SummaryRow label="ОС" values={settlement.os} hint="взятки в сливах" />
          <SummaryRow label="Сум НС" values={settlement.sumNs} hint="ОН − ОС" signed />
          <SummaryRow label="Очки НС" values={settlement.pointsNs} hint="Сум НС × 20" signed />
          <SummaryRow label="Итого" values={settlement.total} strong signed />
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({
  label,
  values,
  hint,
  strong,
  signed,
}: {
  label: string;
  values: number[];
  hint?: string;
  strong?: boolean;
  signed?: boolean;
}) {
  return (
    <tr className={cn("bg-zinc-500/25", strong && "bg-zinc-600/35 font-bold")}>
      <td className="border border-black/25 px-1 py-1 text-center text-[9px] font-semibold uppercase sm:text-[10px]">
        {label}
      </td>
      {PLAYER_IDS.map((playerId) => (
        <td
          key={`${label}-${playerId}`}
          colSpan={2}
          className="border border-black/25 px-1 py-1 text-center"
          title={hint}
        >
          {signed && values[playerId] > 0 ? "+" : ""}
          {values[playerId]}
        </td>
      ))}
    </tr>
  );
}

"use client";

import { Fragment, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { handRow } from "@/lib/game/schedule";
import {
  buildScoreboard,
  totalJokers,
  type Settlement,
} from "@/lib/game/scoring";
import {
  PLAYER_IDS,
  type GameState,
  type PlayerId,
  type ResultEdit,
} from "@/lib/game/types";

function jokerTitle(jokers: number): string | undefined {
  if (jokers === 1) return "На руках был 1 джокер";
  if (jokers === 2) return "На руках было 2 джокера";
  return undefined;
}

/** Пометка джокеров как на бумаге: 1 джокер — кружок, 2 джокера — прямоугольник. */
function JokerMark({
  jokers,
  children,
}: {
  jokers: number;
  children: React.ReactNode;
}) {
  if (jokers <= 0) return <>{children}</>;
  return (
    <span
      title={jokerTitle(jokers)}
      className={jokers === 1 ? "joker-mark-circle" : "joker-mark-box"}
    >
      {children}
    </span>
  );
}

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
  onEdit,
}: {
  state: GameState;
  settlement: Settlement;
  currentRow: number;
  /** Если передан — хозяин стола может править сыгранные строки. */
  onEdit?: (edit: ResultEdit) => void;
}) {
  const rows = buildScoreboard(state.results, state.premiums);
  const raceRow = rows.find((row) => row.race);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<{
    handIndex: number;
    player: PlayerId;
  } | null>(null);

  const selectedResult = selected
    ? state.results.find((r) => r.handIndex === selected.handIndex)
    : undefined;

  return (
    <div className="space-y-3">
      {raceRow?.race && (
        <PremiumRaceBanner
          state={state}
          race={raceRow.race}
          label={raceRow.label}
          blockSize={raceRow.blockSize ?? 0}
        />
      )}
      {onEdit && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-ember/30 bg-black/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {editMode
              ? "Нажмите на заказ или взятки сыгранной строки, чтобы поправить."
              : "Вы хозяин стола — можете поправить записи в протоколе."}
          </span>
          <Button
            size="sm"
            variant={editMode ? "default" : "secondary"}
            onClick={() => {
              setEditMode((on) => !on);
              setSelected(null);
            }}
          >
            <Pencil className="size-3.5" aria-hidden />
            {editMode ? "Готово" : "Править"}
          </Button>
        </div>
      )}
      {editMode && onEdit && selected && selectedResult && (
        <ResultEditor
          key={`${selected.handIndex}-${selected.player}`}
          state={state}
          result={selectedResult}
          player={selected.player}
          onSave={(edit) => {
            onEdit(edit);
            setSelected(null);
          }}
          onCancel={() => setSelected(null)}
        />
      )}
      <div className="protocol-sheet overflow-x-auto rounded-md border border-black/20 shadow-2xl">
        <table className="w-full min-w-[21rem] border-collapse font-mono text-[11px] leading-tight sm:text-xs">
          <thead>
            <tr className="bg-black/[0.07]">
              <th className="w-9 border border-black/25 px-1 py-1.5 text-center font-semibold">
                №
              </th>
              {state.players.map((player) => (
                <th
                  key={player.id}
                  colSpan={2}
                  className="border border-black/25 px-1 py-1.5 text-center text-[10px] font-semibold sm:px-2 sm:text-xs"
                >
                  {player.name}
                </th>
              ))}
            </tr>
            <tr className="bg-black/[0.04] text-[9px] uppercase tracking-wide sm:text-[10px]">
              <th className="border border-black/25 px-1 py-1" />
              {state.players.map((player) => (
                <Fragment key={player.id}>
                  <th className="border border-black/25 px-1 py-1 font-normal">
                    заказ
                  </th>
                  <th className="min-w-9 border border-black/25 px-1 py-1 font-normal">
                    счёт
                  </th>
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
                  <td className="border border-black/25 px-1 py-1 text-center">
                    {row.label}
                  </td>
                  {PLAYER_IDS.map((playerId) => {
                    const cell = row.cells[playerId];
                    if (row.race) {
                      const entry = row.race[playerId];
                      return (
                        <td
                          key={`${row.row}-${playerId}`}
                          colSpan={2}
                          className="border border-black/25 px-1 py-1 text-center"
                          title={
                            entry.alive
                              ? "Ещё в гонке за премией блока"
                              : "Заказ в блоке не выполнен — премии не будет"
                          }
                        >
                          {entry.alive ? (
                            <span className="text-emerald-800">в гонке</span>
                          ) : (
                            <span className="text-red-900/70 line-through">
                              выбыл
                            </span>
                          )}
                          {row.blockSize ? (
                            <span className="ml-1 text-[9px] text-black/45">
                              {entry.exact}/{row.blockSize}
                            </span>
                          ) : null}
                        </td>
                      );
                    }
                    const left = isNs
                      ? cell.tricks
                      : isPremium
                        ? cell.points || null
                        : cell.bid;
                    const editable =
                      editMode &&
                      onEdit &&
                      row.played &&
                      row.handIndex !== null;
                    const pick = () => {
                      if (editable && row.handIndex !== null) {
                        setSelected({
                          handIndex: row.handIndex,
                          player: playerId,
                        });
                      }
                    };
                    const isSelected =
                      selected?.handIndex === row.handIndex &&
                      selected?.player === playerId;
                    return (
                      <Fragment key={`${row.row}-${playerId}`}>
                        <td
                          onClick={pick}
                          className={cn(
                            "border border-black/25 px-1 py-1 text-center",
                            editable && "cursor-pointer hover:bg-amber-300/50",
                            isSelected && "bg-amber-300/70",
                          )}
                        >
                          {isPremium ? (
                            left ? (
                              <span className="text-blue-900">+{left}</span>
                            ) : (
                              <span className="text-black/30">~</span>
                            )
                          ) : (
                            <JokerMark jokers={isNs ? cell.jokers : 0}>
                              {left === 0 && !isNs && row.played
                                ? "—"
                                : cellText(left)}
                            </JokerMark>
                          )}
                        </td>
                        <td
                          onClick={pick}
                          className={cn(
                            "border border-black/25 px-1 py-1 text-center",
                            editable && "cursor-pointer hover:bg-amber-300/50",
                            isSelected && "bg-amber-300/70",
                          )}
                        >
                          <JokerMark
                            jokers={isNs || isPremium ? 0 : cell.jokers}
                          >
                            {cellText(cell.runningTotal)}
                          </JokerMark>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}

            <SummaryRow
              label="ОН"
              values={settlement.on}
              hint="взятки в наборах"
            />
            <SummaryRow
              label="ОС"
              values={settlement.os}
              hint="взятки в сливах"
            />
            <SummaryRow
              label="Сум НС"
              values={settlement.sumNs}
              hint="ОН − ОС"
              signed
            />
            <SummaryRow
              label="Очки НС"
              values={settlement.pointsNs}
              hint="Сум НС × 20"
              signed
            />
            <SummaryRow label="Итого" values={settlement.total} strong signed />
            <SummaryRow
              label="Джокеры"
              values={totalJokers(state.results)}
              hint="Сколько джокеров было на руках за всю игру"
            />
          </tbody>
        </table>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/20 bg-black/[0.04] px-3 py-2 text-[11px] text-black/70">
          <span>Джокеры на руках в раздаче:</span>
          <span className="flex items-center gap-1.5">
            <span className="joker-mark-circle">12</span> один
          </span>
          <span className="flex items-center gap-1.5">
            <span className="joker-mark-box">12</span> два
          </span>
        </p>
      </div>
    </div>
  );
}

function PremiumRaceBanner({
  state,
  race,
  label,
  blockSize,
}: {
  state: GameState;
  race: NonNullable<ReturnType<typeof buildScoreboard>[number]["race"]>;
  label: string;
  blockSize: number;
}) {
  const alive = state.players.filter((p) => race[p.id].alive);
  const played = race[0].played;
  return (
    <div className="rounded-md border border-ember/30 bg-black/30 px-3 py-2 text-xs">
      <p className="font-heading uppercase tracking-wider text-ember/90">
        Премия блока ({label})
      </p>
      <p className="mt-1 text-muted-foreground">
        Сыграно {played} из {blockSize}.{" "}
        {alive.length === 0
          ? "Никто не остался в гонке — премии не будет."
          : alive.length === state.players.length
            ? "Пока в гонке все: заказы пока взяты точно у каждого."
            : `Ещё в гонке: ${alive.map((p) => p.name).join(", ")}.`}
      </p>
    </div>
  );
}

function ResultEditor({
  state,
  result,
  player,
  onSave,
  onCancel,
}: {
  state: GameState;
  result: GameState["results"][number];
  player: PlayerId;
  onSave: (edit: ResultEdit) => void;
  onCancel: () => void;
}) {
  const hasBid = result.kind === "normal" || result.kind === "dark";
  const [bid, setBid] = useState(String(result.bids[player] ?? 0));
  const [tricks, setTricks] = useState(String(result.tricks[player]));
  const [jokers, setJokers] = useState(String(result.jokers[player] ?? 0));

  const num = (v: string) => Number.parseInt(v, 10);
  const valid =
    (!hasBid || (num(bid) >= 0 && num(bid) <= result.cards)) &&
    num(tricks) >= 0 &&
    num(tricks) <= result.cards &&
    num(jokers) >= 0 &&
    num(jokers) <= 2;

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    max: number,
  ) => (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="h-8 w-20 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-foreground outline-none focus:border-ember/60"
      />
    </label>
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-ember/40 bg-black/40 px-3 py-3">
      <p className="w-full text-xs text-foreground">
        {state.players[player].name}, строка {handLabel(result.handIndex)}:
      </p>
      {hasBid && field("Заказ", bid, setBid, result.cards)}
      {field("Взято", tricks, setTricks, result.cards)}
      {field("Джокеров", jokers, setJokers, 2)}
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          size="sm"
          disabled={!valid}
          onClick={() =>
            onSave({
              handIndex: result.handIndex,
              player,
              ...(hasBid ? { bid: num(bid) } : {}),
              tricks: num(tricks),
              jokers: num(jokers),
            })
          }
        >
          Сохранить
        </Button>
      </div>
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

function handLabel(handIndex: number): string {
  return handRow(handIndex).label;
}

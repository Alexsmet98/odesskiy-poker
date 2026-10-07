"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SUIT_IS_RED,
  SUIT_LABEL,
  SUIT_SYMBOL,
  SUITS,
  type Suit,
} from "@/lib/game/cards";
import type { JokerDeclaration } from "@/lib/game/types";

type LeadMode = "lead-high" | "lead-low" | "dump-highest" | "dump-lowest";

const LEAD_MODES: { mode: LeadMode; title: string; hint: string }[] = [
  {
    mode: "lead-high",
    title: "Джокер старший",
    hint: "Задаёте масть. У кого она есть — обязан положить самую старшую карту этой масти, иначе любую. Взятка ваша, даже против туза.",
  },
  {
    mode: "lead-low",
    title: "Джокер младший",
    hint: "Задаёте масть. У кого она есть — обязан положить самую младшую карту этой масти, иначе любую. Взятка ваша, даже против шестёрки.",
  },
  {
    mode: "dump-highest",
    title: "Слив: заберёт старшая",
    hint: "Взятку забирает старшая карта названной масти. Джокер «старшим козырем» забирает её любого цвета.",
  },
  {
    mode: "dump-lowest",
    title: "Слив: заберёт младшая",
    hint: "Взятку забирает младшая карта названной масти. Джокер «старшим козырем» забирает её любого цвета.",
  },
];

export function JokerDialog({
  open,
  isLead,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isLead: boolean;
  onCancel: () => void;
  onConfirm: (declaration: JokerDeclaration) => void;
}) {
  const [mode, setMode] = useState<LeadMode>("lead-high");
  const [suit, setSuit] = useState<Suit>("spades");

  const confirmLead = () => {
    if (mode === "dump-highest" || mode === "dump-lowest") {
      onConfirm({
        kind: "lead",
        mode: "dump",
        suit,
        target: mode === "dump-highest" ? "highest" : "lowest",
      });
      return;
    }
    onConfirm({ kind: "lead", mode, suit });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-lg border-ember/30 bg-card">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl tracking-wide">
            {isLead ? "Заход джокером" : "Джокер в ответ"}
          </DialogTitle>
          <DialogDescription>
            {isLead
              ? "Объявите масть и режим — вслух и до того, как карта легла на стол."
              : "Объявите, чем кладёте джокера."}
          </DialogDescription>
        </DialogHeader>

        {isLead ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              {LEAD_MODES.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => setMode(option.mode)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    mode === option.mode
                      ? "border-ember/70 bg-ember/10"
                      : "border-white/10 bg-black/30 hover:border-ember/40",
                  )}
                >
                  <span className="block font-heading text-sm tracking-wide">
                    {option.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Масть
              </p>
              <div className="flex gap-2">
                {SUITS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSuit(s)}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-2 text-lg transition-colors",
                      suit === s
                        ? "border-ember/70 bg-ember/10"
                        : "border-white/10 bg-black/30 hover:border-ember/40",
                      SUIT_IS_RED[s] ? "text-red-400" : "text-zinc-200",
                    )}
                    title={SUIT_LABEL[s]}
                  >
                    {SUIT_SYMBOL[s]}
                  </button>
                ))}
              </div>
            </div>

            <p className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-muted-foreground">
              {`Объявляю: ${SUIT_LABEL[suit]}, ${
                mode === "lead-high"
                  ? "джокер старший"
                  : mode === "lead-low"
                    ? "джокер младший"
                    : mode === "dump-highest"
                      ? "взятку заберёт старшая"
                      : "взятку заберёт младшая"
              }.`}
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Назад
              </Button>
              <Button onClick={confirmLead}>Объявить и зайти</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onConfirm({ kind: "response", mode: "high" })}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-left transition-colors hover:border-ember/60 hover:bg-ember/10"
            >
              <span className="block font-heading tracking-wide">
                Наисильнейший козырь
              </span>
              <span className="block text-xs text-muted-foreground">
                Забираю взятку, даже если она уже бита тузом.
              </span>
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ kind: "response", mode: "low" })}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-left transition-colors hover:border-ember/60 hover:bg-ember/10"
            >
              <span className="block font-heading tracking-wide">
                Самая младшая карта
              </span>
              <span className="block text-xs text-muted-foreground">
                Слабее шестёрки любой масти — взятку не беру.
              </span>
            </button>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onCancel}>
                Назад
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

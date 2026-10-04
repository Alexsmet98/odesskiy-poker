"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "@/lib/game/cards";
import { aiDelay, chooseBid, chooseMove } from "@/lib/game/ai";
import {
  activePlayer,
  applyAction,
  createGame,
  currentHandRow,
  currentRow,
  legalBidsFor,
  settlement,
} from "@/lib/game/engine";
import { legalPlays } from "@/lib/game/rules";
import type { GameState, JokerDeclaration, PlayerId } from "@/lib/game/types";

const TRICK_PAUSE_MS = 1500;

export type GameController = ReturnType<typeof useGame>;

export function useGame(initialSeed?: number) {
  const [state, setState] = useState<GameState>(() => createGame({ seed: initialSeed }));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const human = useMemo(
    () => (state.players.find((p) => p.isHuman)?.id ?? 0) as PlayerId,
    [state.players],
  );

  const dispatch = useCallback((update: (prev: GameState) => GameState) => {
    setState((prev) => {
      try {
        const next = update(prev);
        setError(null);
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Непонятный ход");
        return prev;
      }
    });
  }, []);

  const acting = activePlayer(state);
  const waitingForHuman = acting === human;

  // Ходы ботов и сбор доигранной взятки идут сами, с паузой — чтобы стол читался.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (state.phase === "trick-complete") {
      timer.current = setTimeout(
        () => dispatch((prev) => applyAction(prev, { type: "collect-trick" })),
        TRICK_PAUSE_MS,
      );
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }

    if (acting === null || acting === human) return;

    const bot = acting;
    timer.current = setTimeout(() => {
      dispatch((prev) => {
        if (activePlayer(prev) !== bot) return prev;
        if (prev.phase === "bidding") {
          return applyAction(prev, { type: "bid", player: bot, value: chooseBid(prev, bot) });
        }
        const move = chooseMove(prev, bot);
        return applyAction(prev, {
          type: "play",
          player: bot,
          card: move.card,
          declaration: move.declaration,
        });
      });
    }, aiDelay(state));

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [acting, dispatch, human, state, state.phase]);

  const row = currentRow(state);
  const handRow = currentHandRow(state);

  const humanLegalBids = state.phase === "bidding" ? legalBidsFor(state, human) : [];
  const humanLegalCards =
    state.phase === "playing" && waitingForHuman && state.currentTrick
      ? legalPlays(
          state.hands[human],
          state.currentTrick.plays.length === 0 ? null : state.currentTrick,
        )
      : [];

  const placeBid = useCallback(
    (value: number) => {
      dispatch((prev) => applyAction(prev, { type: "bid", player: human, value }));
    },
    [dispatch, human],
  );

  const playCard = useCallback(
    (card: Card, declaration: JokerDeclaration | null = null) => {
      dispatch((prev) => applyAction(prev, { type: "play", player: human, card, declaration }));
    },
    [dispatch, human],
  );

  const nextRow = useCallback(() => {
    dispatch((prev) => applyAction(prev, { type: "next-row" }));
  }, [dispatch]);

  const restart = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setError(null);
    setState(createGame());
  }, []);

  return {
    state,
    human,
    row,
    handRow,
    acting,
    waitingForHuman,
    humanLegalBids,
    humanLegalCards,
    settlement: settlement(state),
    error,
    placeBid,
    playCard,
    nextRow,
    restart,
  };
}

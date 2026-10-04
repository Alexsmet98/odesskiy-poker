"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { GameTableView } from "./table-view";
import { useGame } from "./use-game";

const subscribeNoop = () => () => {};

/**
 * Жребий и тасовка случайны, поэтому стол рисуется только на клиенте —
 * иначе HTML с сервера не совпадёт с первой отрисовкой в браузере.
 * Параметр ?seed=N делает партию воспроизводимой.
 */
export function GameTable() {
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  if (!isClient) {
    return <div className="min-h-dvh bg-background" aria-busy="true" />;
  }
  const raw = new URLSearchParams(window.location.search).get("seed");
  const parsed = raw === null ? NaN : Number(raw);
  return (
    <LocalGame seed={Number.isInteger(parsed) ? parsed >>> 0 : undefined} />
  );
}

function LocalGame({ seed }: { seed?: number }) {
  const game = useGame(seed);
  return (
    <GameTableView
      game={game}
      headerExtra={
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          В меню
        </Link>
      }
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Имена, которые уже заведены в журнале турнира. */
export function useRoster(): {
  names: string[] | null;
  error: string | null;
} {
  const [names, setNames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/turnir/players")
      .then((response) => {
        if (!response.ok) throw new Error("list");
        return response.json() as Promise<{ name: string }[]>;
      })
      .then((rows) => {
        if (cancelled) return;
        setNames(
          rows
            .map((row) => row.name)
            .sort((a, b) => a.localeCompare(b, "ru")),
        );
      })
      .catch(() => {
        if (!cancelled) setError("Список игроков не открылся");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { names, error };
}

export function RosterNameField({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: string;
  onValueChange: (name: string) => void;
}) {
  const { names, error } = useRoster();
  const selected = names?.includes(value) ? value : "";

  useEffect(() => {
    if (!names || !value || names.includes(value)) return;
    onValueChange("");
  }, [names, onValueChange, value]);

  if (error) {
    return <p className="text-sm text-red-300">{error}. Обновите страницу.</p>;
  }
  if (names && names.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        В турнире пока нет игроков. Добавьте их в{" "}
        <a href="/turnir" className="text-ember underline">
          журнале
        </a>
        , затем выберите имя здесь.
      </p>
    );
  }

  return (
    <select
      id={id}
      value={selected}
      disabled={!names}
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
      )}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">
        {names ? "Выберите имя" : "Загружаем список…"}
      </option>
      {names?.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

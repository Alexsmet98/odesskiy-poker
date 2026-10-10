"use client";

import { Bot, DoorOpen, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lobbyApi } from "@/lib/net/client";
import {
  LOBBY_CODE_LENGTH,
  MAX_NAME_LENGTH,
  normalizeCode,
} from "@/lib/net/protocol";
import { rememberedName, saveSession } from "@/lib/net/session";
import { cn } from "@/lib/utils";
import { Backdrop, Title } from "./backdrop";

type Mode = "create" | "join" | null;

const subscribeNoop = () => () => {};

export function MainMenu() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const remembered = useSyncExternalStore(
    subscribeNoop,
    rememberedName,
    () => "",
  );
  const [typedName, setTypedName] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = typedName ?? remembered;
  const codeReady = normalizeCode(code).length === LOBBY_CODE_LENGTH;
  const canSubmit =
    name.trim().length > 0 && (mode === "create" || codeReady) && !busy;

  const choose = (next: Mode) => {
    setMode((current) => (current === next ? null : next));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !mode) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "create"
          ? await lobbyApi.create(name)
          : await lobbyApi.join(normalizeCode(code), name);
      saveSession(result.code, {
        token: result.token,
        seat: result.seat,
        name: name.trim(),
      });
      router.push(`/lobby/${result.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <Title />

      <nav aria-label="Главное меню" className="flex flex-col gap-3">
        <MenuOption
          index={1}
          icon={<Plus className="size-5" />}
          title="Создать лобби"
          description="Откройте стол и позовите друзей по четырёхбуквенному коду."
          active={mode === "create"}
          onClick={() => choose("create")}
        />
        <MenuOption
          index={2}
          icon={<DoorOpen className="size-5" />}
          title="Присоединиться к лобби"
          description="Введите код, который назвал хозяин стола."
          active={mode === "join"}
          onClick={() => choose("join")}
        />
        <MenuOption
          index={3}
          icon={<Bot className="size-5" />}
          title="Играть с ботами"
          description="Вы против Жоры Лимана, Розы и Сёмы Тихого."
          href="/bots"
        />
        <MenuOption
          index={4}
          icon={<Trophy className="size-5" />}
          title="Журнал турнира"
          description="Общие игры, рейтинг и награды — у всех один список."
          href="/turnir"
          native
        />
      </nav>

      {mode && (
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-lg border border-white/10 bg-black/55 p-4 backdrop-blur"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="player-name">Ваше имя за столом</Label>
            <Input
              id="player-name"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              autoFocus
              placeholder="Например, Лёва"
              onChange={(e) => setTypedName(e.target.value)}
            />
          </div>
          {mode === "join" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lobby-code">Код лобби</Label>
              <Input
                id="lobby-code"
                value={code}
                maxLength={LOBBY_CODE_LENGTH}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD"
                className="font-mono text-lg tracking-[0.4em] uppercase"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-red-300"
            >
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={!canSubmit}>
            {busy
              ? "Один момент…"
              : mode === "create"
                ? "Открыть стол"
                : "Сесть за стол"}
          </Button>
        </form>
      )}
    </Backdrop>
  );
}

function MenuOption({
  index,
  icon,
  title,
  description,
  active,
  onClick,
  href,
  native,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  native?: boolean;
}) {
  const className = cn(
    "group flex w-full items-center gap-4 rounded-lg border bg-black/55 px-4 py-4 text-left backdrop-blur transition-colors",
    "hover:border-ember/60 hover:bg-ember/5 focus-visible:outline-2 focus-visible:outline-ember",
    active ? "border-ember/70 bg-ember/10" : "border-white/10",
  );
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-black/60 font-mono text-ember">
        {index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-heading text-lg tracking-wide text-foreground">
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </>
  );
  if (href && native) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={className}
    >
      {body}
    </button>
  );
}

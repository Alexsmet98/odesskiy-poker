"use client";

import { Check, Copy, Crown, LogOut, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { NetworkTable } from "@/components/game/network-table";
import { useLobbyEvents } from "@/components/game/use-lobby";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lobbyApi } from "@/lib/net/client";
import {
  MAX_NAME_LENGTH,
  normalizeCode,
  type ServerEvent,
} from "@/lib/net/protocol";
import {
  clearSession,
  parseSession,
  readSessionRaw,
  rememberedName,
  saveSession,
  subscribeSession,
  type Session,
} from "@/lib/net/session";
import { cn } from "@/lib/utils";
import { Backdrop, Title } from "./backdrop";

const subscribeNoop = () => () => {};

export function LobbyScreen({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const raw = useSyncExternalStore(
    subscribeSession,
    () => readSessionRaw(code),
    () => undefined,
  );
  const session = useMemo(
    () => (raw === undefined ? undefined : parseSession(raw)),
    [raw],
  );

  if (session === undefined) {
    return (
      <Backdrop>
        <Title />
        <p
          className="text-center text-sm text-muted-foreground"
          aria-busy="true"
        >
          Открываем дверь…
        </p>
      </Backdrop>
    );
  }
  if (session === null) return <JoinByLink code={code} />;
  return <ConnectedLobby code={code} session={session} />;
}

function JoinByLink({ code }: { code: string }) {
  const remembered = useSyncExternalStore(
    subscribeNoop,
    rememberedName,
    () => "",
  );
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = typedName ?? remembered;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await lobbyApi.join(code, name);
      saveSession(code, {
        token: result.token,
        seat: result.seat,
        name: name.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <Title subtitle={`Вас зовут за стол ${code}`} />
      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-lg border border-white/10 bg-black/55 p-4 backdrop-blur"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="join-name">Ваше имя за столом</Label>
          <Input
            id="join-name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            placeholder="Например, Лёва"
            onChange={(e) => setTypedName(e.target.value)}
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-red-300"
          >
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!name.trim() || busy}>
          {busy ? "Один момент…" : "Сесть за стол"}
        </Button>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          В меню
        </Link>
      </form>
    </Backdrop>
  );
}

function ConnectedLobby({ code, session }: { code: string; session: Session }) {
  const { event, status } = useLobbyEvents(code, session.token);

  if (status === "closed" && !event) {
    return <Dismissed code={code} />;
  }
  if (!event) {
    return (
      <Backdrop>
        <Title />
        <p
          className="text-center text-sm text-muted-foreground"
          aria-busy="true"
        >
          Подключаемся к столу {code}…
        </p>
      </Backdrop>
    );
  }
  if (status === "closed") return <Dismissed code={code} />;

  if (event.lobby.status === "playing" && event.game) {
    return (
      <NetworkTable
        code={code}
        session={session}
        event={event}
        connection={status}
      />
    );
  }
  return (
    <WaitingRoom
      code={code}
      session={session}
      event={event}
      connected={status === "open"}
    />
  );
}

function Dismissed({ code }: { code: string }) {
  return (
    <Backdrop>
      <Title />
      <div className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-black/55 p-5 text-center">
        <p className="font-heading text-lg text-ember">Стол закрыт</p>
        <p className="text-sm text-muted-foreground">
          Лобби {code} больше нет, или вы за ним уже не сидите.
        </p>
        <Link
          href="/"
          onClick={() => clearSession(code)}
          className={buttonVariants({ size: "lg" })}
        >
          В меню
        </Link>
      </div>
    </Backdrop>
  );
}

function WaitingRoom({
  code,
  session,
  event,
  connected,
}: {
  code: string;
  session: Session;
  event: ServerEvent;
  connected: boolean;
}) {
  const router = useRouter();
  const { lobby } = event;
  const isHost = lobby.mySeat === lobby.hostSeat;
  const humans = lobby.seats.filter((s) => s.kind === "human").length;
  const empty = 4 - humans;
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async (what: "code" | "link") => {
    const text =
      what === "code" ? code : `${window.location.origin}/lobby/${code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Браузер не дал скопировать — выделите код вручную");
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await lobbyApi.start(code, session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось начать");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    lobbyApi.leave(code, session.token).catch(() => {});
    clearSession(code);
    router.push("/");
  };

  return (
    <Backdrop>
      <Title subtitle="Стол накрыт, ждём игроков" />

      <section className="flex flex-col items-center gap-3 rounded-lg border border-ember/30 bg-black/55 p-5 backdrop-blur">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Код лобби
        </p>
        <p
          className="font-mono text-5xl tracking-[0.3em] text-ember"
          data-testid="lobby-code"
          aria-label={`Код лобби: ${code.split("").join(" ")}`}
        >
          {code}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => copy("code")}>
            {copied === "code" ? <Check /> : <Copy />}
            {copied === "code" ? "Скопировано" : "Скопировать код"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => copy("link")}>
            {copied === "link" ? <Check /> : <Copy />}
            {copied === "link" ? "Скопировано" : "Скопировать ссылку"}
          </Button>
        </div>
      </section>

      <section aria-label="Места за столом">
        <ul className="flex flex-col gap-2">
          {lobby.seats.map((seat) => (
            <li
              key={seat.seat}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3",
                seat.kind === "empty"
                  ? "border-dashed border-white/10 bg-black/30"
                  : "border-white/10 bg-black/55",
                seat.seat === lobby.mySeat && "border-ember/50",
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-black/60 font-mono text-xs text-muted-foreground">
                {seat.seat + 1}
              </span>
              {seat.kind === "empty" ? (
                <span className="text-sm text-muted-foreground">
                  Ждём игрока…
                </span>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {seat.name}
                    {seat.seat === lobby.mySeat && (
                      <span className="ml-2 text-xs text-ember">это вы</span>
                    )}
                  </span>
                  {seat.seat === lobby.hostSeat && (
                    <span className="flex items-center gap-1 text-xs text-amber-200/80">
                      <Crown className="size-3.5" /> хозяин
                    </span>
                  )}
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      seat.connected
                        ? "text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {seat.connected ? (
                      <Wifi className="size-3.5" />
                    ) : (
                      <WifiOff className="size-3.5" />
                    )}
                    {seat.connected ? "на месте" : "не в сети"}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!connected && (
        <p className="text-center text-xs text-amber-300/80">
          Связь потеряна, переподключаемся…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {isHost ? (
          <>
            <Button size="lg" onClick={start} disabled={busy}>
              {empty === 0
                ? "Начать партию"
                : `Начать сейчас — ${empty === 1 ? "место займёт бот" : `${empty} места займут боты`}`}
            </Button>
            {empty > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                Можно дождаться всех: пока партия не началась, места доступны по
                коду.
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Ждём, пока хозяин начнёт партию.
          </p>
        )}
        <Button variant="ghost" onClick={leave}>
          <LogOut /> Выйти из лобби
        </Button>
      </div>
    </Backdrop>
  );
}

import { describe, expect, it } from "vitest";
import { legalBidsFor } from "@/lib/game/engine";
import { legalPlays } from "@/lib/game/rules";
import { LobbyError, LobbyManager, type Scheduler } from "../lobby";
import type { ServerEvent } from "../protocol";

class FakeScheduler implements Scheduler {
  private tasks = new Map<number, () => void>();
  private nextId = 1;
  set(fn: () => void): unknown {
    const id = this.nextId++;
    this.tasks.set(id, fn);
    return id;
  }
  clear(handle: unknown): void {
    this.tasks.delete(handle as number);
  }
  get pending(): number {
    return this.tasks.size;
  }
  runNext(): boolean {
    const first = this.tasks.entries().next();
    if (first.done) return false;
    const [id, fn] = first.value;
    this.tasks.delete(id);
    fn();
    return true;
  }
}

function setup() {
  const scheduler = new FakeScheduler();
  const manager = new LobbyManager(scheduler);
  return { scheduler, manager };
}

function fullLobby() {
  const { scheduler, manager } = setup();
  const host = manager.create("Аня");
  const b = manager.join(host.code, "Борис");
  const c = manager.join(host.code, "Вера");
  const d = manager.join(host.code, "Глеб");
  return {
    scheduler,
    manager,
    code: host.code,
    tokens: [host.token, b.token, c.token, d.token],
  };
}

describe("лобби: комната и места", () => {
  it("создаёт лобби с кодом из четырёх букв и хозяином на месте 0", () => {
    const { manager } = setup();
    const created = manager.create("  Аня  ");
    expect(created.code).toMatch(/^[A-Z]{4}$/);
    expect(created.seat).toBe(0);
    const event = manager.viewFor(created.code, created.token);
    expect(event.lobby.seats[0]).toMatchObject({ kind: "human", name: "Аня" });
    expect(event.lobby.hostSeat).toBe(0);
    expect(event.game).toBeNull();
  });

  it("сажает вошедших на свободные места и находит лобби по коду в любом регистре", () => {
    const { manager } = setup();
    const host = manager.create("Аня");
    const joined = manager.join(host.code.toLowerCase(), "Борис");
    expect(joined.seat).toBe(1);
    expect(manager.info(host.code)).toMatchObject({
      status: "waiting",
      freeSeats: 2,
    });
  });

  it("не пускает пятого, дубликат имени и чужой код", () => {
    const { manager, code } = fullLobby();
    expect(() => manager.join(code, "Дима")).toThrow(/нет свободных мест/);

    const other = manager.create("Аня");
    expect(() => manager.join(other.code, "аня")).toThrow(/имя/);
    expect(() => manager.join("ZZZZ", "Дима")).toThrow(LobbyError);
    expect(() => manager.join(other.code, "   ")).toThrow(/Назовите/);
    expect(() => manager.join(other.code, "x".repeat(40))).toThrow(/длиннее/);
  });

  it("начинать партию может только хозяин, и после старта вход закрыт", () => {
    const { manager, code, tokens } = fullLobby();
    expect(() => manager.start(code, tokens[1])).toThrow(/хозяин/);
    manager.start(code, tokens[0]);
    expect(manager.info(code).status).toBe("playing");
    expect(() => manager.start(code, tokens[0])).toThrow(/уже идёт/);
    expect(() => manager.join(code, "Дима")).toThrow(/уже идёт/);
  });

  it("пустые места при старте занимают боты", () => {
    const { manager } = setup();
    const host = manager.create("Аня");
    manager.join(host.code, "Борис");
    manager.start(host.code, host.token);
    const view = manager.viewFor(host.code, host.token);
    expect(view.lobby.seats.map((s) => s.kind)).toEqual([
      "human",
      "human",
      "bot",
      "bot",
    ]);
    expect(view.game?.players.map((p) => p.name)).toHaveLength(4);
  });

  it("выход до старта освобождает место и передаёт хозяина", () => {
    const { manager } = setup();
    const host = manager.create("Аня");
    const b = manager.join(host.code, "Борис");
    manager.leave(host.code, host.token);
    const view = manager.viewFor(host.code, b.token);
    expect(view.lobby.seats[0].kind).toBe("empty");
    expect(view.lobby.hostSeat).toBe(1);
    manager.leave(host.code, b.token);
    expect(manager.size).toBe(0);
  });

  it("выход во время партии отдаёт место боту", () => {
    const { manager, code, tokens } = fullLobby();
    manager.start(code, tokens[0]);
    manager.leave(code, tokens[2]);
    const view = manager.viewFor(code, tokens[0]);
    expect(view.lobby.seats[2]).toMatchObject({ kind: "bot", name: "Вера" });
    expect(() => manager.viewFor(code, tokens[2])).toThrow(/не сидите/);
  });
});

describe("лобби: скрытая информация", () => {
  it("игрок видит только свои карты, у чужих — одинаковые рубашки", () => {
    const { manager, code, tokens } = fullLobby();
    manager.start(code, tokens[0]);
    const views = tokens.map((t) => manager.viewFor(code, t));
    const real = views.map((v, seat) => v.game!.hands[seat]);
    expect(real.every((hand) => hand.length > 0)).toBe(true);

    for (const [viewerSeat, view] of views.entries()) {
      const json = JSON.stringify(view);
      for (const [owner, hand] of real.entries()) {
        if (owner === viewerSeat) continue;
        for (const card of hand) expect(json).not.toContain(`"${card.id}"`);
      }
      view.game!.hands.forEach((hand, owner) => {
        if (owner !== viewerSeat) {
          expect(hand.every((c) => c.id.startsWith("hidden-"))).toBe(true);
          expect(hand).toHaveLength(real[owner].length);
        }
      });
      expect(view.game!.seed).toBe(0);
      expect(view.game!.dealtJokers).toEqual([0, 0, 0, 0]);
      expect(
        view.game!.players.filter((p) => p.isHuman).map((p) => p.id),
      ).toEqual([viewerSeat]);
    }
  });
});

describe("лобби: партия", () => {
  function listen(manager: LobbyManager, code: string, token: string) {
    const events: ServerEvent[] = [];
    const off = manager.subscribe(code, token, (e) => events.push(e));
    return { events, off, last: () => events[events.length - 1] };
  }

  it("рассылает состояние всем подписчикам после хода", () => {
    const { manager, code, tokens } = fullLobby();
    const a = listen(manager, code, tokens[0]);
    const b = listen(manager, code, tokens[1]);
    manager.start(code, tokens[0]);
    expect(a.last().game).not.toBeNull();
    expect(b.last().game).not.toBeNull();

    const game = manager.viewFor(code, tokens[0]).game!;
    const seat = game.bidTurn!;
    const bid = legalBidsFor(game, seat)[0];
    const before = a.events.length;
    manager.act(code, tokens[seat], { type: "bid", value: bid });
    expect(a.events.length).toBe(before + 1);
    expect(b.last().game!.bids[seat]).toBe(bid);
  });

  it("не принимает ход не в свою очередь и чужую карту", () => {
    const { manager, code, tokens } = fullLobby();
    manager.start(code, tokens[0]);
    const game = manager.viewFor(code, tokens[0]).game!;
    const wrong = ((game.bidTurn! + 1) % 4) as 0 | 1 | 2 | 3;
    expect(() =>
      manager.act(code, tokens[wrong], { type: "bid", value: 0 }),
    ).toThrow(/очередь/);
    expect(() =>
      manager.act(code, tokens[game.bidTurn!], {
        type: "play",
        cardId: "spades-14",
        declaration: null,
      }),
    ).toThrow(LobbyError);
    expect(() =>
      manager.act(code, "bad-token", { type: "bid", value: 0 }),
    ).toThrow(/не сидите/);
  });

  it("боты ходят сами по таймеру, а взятку собирает сервер", () => {
    const { manager, scheduler } = setup();
    const host = manager.create("Аня");
    const { events } = listen(manager, host.code, host.token);
    manager.start(host.code, host.token);

    let guard = 0;
    while (guard < 200) {
      guard += 1;
      const game = manager.viewFor(host.code, host.token).game!;
      if (game.phase === "bidding" && game.bidTurn === 0) {
        manager.act(host.code, host.token, {
          type: "bid",
          value: legalBidsFor(game, 0)[0],
        });
        continue;
      }
      if (game.phase === "playing" && game.turn === 0) break;
      if (!scheduler.runNext()) break;
    }
    const game = manager.viewFor(host.code, host.token).game!;
    expect(game.phase).toBe("playing");
    expect(game.turn).toBe(0);
    expect(game.log.length).toBeGreaterThan(5);
    expect(events.length).toBeGreaterThan(5);

    const hand = game.hands[0];
    const legal = legalPlays(
      hand,
      game.currentTrick!.plays.length === 0 ? null : game.currentTrick!,
    );
    expect(legal.length).toBeGreaterThan(0);
  });

  it("боты не ходят, пока за столом никто не подключён", () => {
    const { manager, scheduler } = setup();
    const host = manager.create("Аня");
    manager.start(host.code, host.token);
    expect(scheduler.pending).toBe(0);
    const { off } = listen(manager, host.code, host.token);
    off();
    expect(scheduler.pending).toBe(0);
  });

  it("играет партию до конца вчетвером и все четверо видят одно и то же", () => {
    const { manager, scheduler, code, tokens } = fullLobby();
    for (const token of tokens) listen(manager, code, token);
    manager.start(code, tokens[0]);

    let guard = 0;
    while (guard < 20000) {
      guard += 1;
      scheduler.runNext();
      const game = manager.viewFor(code, tokens[0]).game!;
      if (game.phase === "game-over") break;
      const acting =
        game.phase === "bidding"
          ? game.bidTurn
          : game.phase === "playing"
            ? game.turn
            : null;
      if (game.phase === "hand-complete" || game.phase === "premium") {
        manager.act(code, tokens[0], {
          type: "next-row",
          rowIndex: game.rowIndex,
        });
        manager.act(code, tokens[1], {
          type: "next-row",
          rowIndex: game.rowIndex,
        });
        continue;
      }
      if (acting === null) continue;
      const mine = manager.viewFor(code, tokens[acting]).game!;
      if (mine.phase === "bidding") {
        manager.act(code, tokens[acting], {
          type: "bid",
          value: legalBidsFor(mine, acting)[0],
        });
      } else {
        const trick = mine.currentTrick!;
        const card = legalPlays(
          mine.hands[acting],
          trick.plays.length === 0 ? null : trick,
        )[0];
        const declaration =
          card.kind === "joker"
            ? trick.plays.length === 0
              ? ({ kind: "lead", mode: "lead-high", suit: "spades" } as const)
              : ({ kind: "response", mode: "low" } as const)
            : null;
        manager.act(code, tokens[acting], {
          type: "play",
          cardId: card.id,
          declaration,
        });
      }
    }

    const views = tokens.map((t) => manager.viewFor(code, t).game!);
    expect(views[0].phase).toBe("game-over");
    expect(views[0].results).toHaveLength(36);
    for (const view of views) expect(view.results).toEqual(views[0].results);
  });

  it("повторное «Дальше» с устаревшей строкой игнорируется", () => {
    const { manager, scheduler, code, tokens } = fullLobby();
    for (const token of tokens) listen(manager, code, token);
    manager.start(code, tokens[0]);
    let guard = 0;
    while (guard < 5000) {
      guard += 1;
      scheduler.runNext();
      const game = manager.viewFor(code, tokens[0]).game!;
      if (game.phase === "hand-complete") break;
      const acting =
        game.phase === "bidding"
          ? game.bidTurn
          : game.phase === "playing"
            ? game.turn
            : null;
      if (acting === null) continue;
      const mine = manager.viewFor(code, tokens[acting]).game!;
      if (mine.phase === "bidding") {
        manager.act(code, tokens[acting], {
          type: "bid",
          value: legalBidsFor(mine, acting)[0],
        });
      } else {
        const trick = mine.currentTrick!;
        const card = legalPlays(
          mine.hands[acting],
          trick.plays.length === 0 ? null : trick,
        )[0];
        const declaration =
          card.kind === "joker"
            ? trick.plays.length === 0
              ? ({ kind: "lead", mode: "lead-high", suit: "spades" } as const)
              : ({ kind: "response", mode: "low" } as const)
            : null;
        manager.act(code, tokens[acting], {
          type: "play",
          cardId: card.id,
          declaration,
        });
      }
    }
    const done = manager.viewFor(code, tokens[0]).game!;
    expect(done.phase).toBe("hand-complete");
    manager.act(code, tokens[0], { type: "next-row", rowIndex: done.rowIndex });
    manager.act(code, tokens[1], { type: "next-row", rowIndex: done.rowIndex });
    const after = manager.viewFor(code, tokens[0]).game!;
    expect(after.rowIndex).toBe(done.rowIndex + 1);
  });
});

describe("лобби: long-poll вместо SSE", () => {
  it("сразу отвечает при устаревшей версии и ждёт изменения при актуальной", async () => {
    const { manager } = setup();
    const host = manager.create("Аня");

    const first = await manager.poll(host.code, host.token, -1);
    expect(first).not.toBeNull();
    expect(first?.event.lobby.seats[0].connected).toBe(true);

    let resolved = false;
    const waiting = manager
      .poll(host.code, host.token, first!.version)
      .then((reply) => {
        resolved = true;
        return reply;
      });
    await Promise.resolve();
    expect(resolved).toBe(false);

    manager.join(host.code, "Борис");
    const next = await waiting;
    expect(next?.version).toBeGreaterThan(first!.version);
    expect(next?.event.lobby.seats[1]).toMatchObject({ name: "Борис" });
  });

  it("когда опросы прекращаются, аренда истекает и игрок отмечается как ушедший", async () => {
    const { manager, scheduler } = setup();
    const host = manager.create("Аня");
    const first = await manager.poll(host.code, host.token, -1);

    const waiting = manager.poll(host.code, host.token, first!.version);
    scheduler.runNext();
    const reply = await waiting;
    expect(reply?.event.lobby.seats[0].connected).toBe(false);
    expect(
      manager.viewFor(host.code, host.token).lobby.seats[0].connected,
    ).toBe(false);
  });

  it("поллинг считается присутствием: боты ходят, пока человек опрашивает лобби", async () => {
    const { manager, scheduler } = setup();
    const host = manager.create("Аня");
    manager.start(host.code, host.token);
    await manager.poll(host.code, host.token, -1);
    expect(scheduler.pending).toBeGreaterThan(0);
  });
});

describe("лобби: правка протокола", () => {
  it("доступна только хозяину", () => {
    const { manager, code, tokens } = fullLobby();
    manager.start(code, tokens[0]);
    const edit = {
      type: "edit-result" as const,
      handIndex: 0,
      player: 1 as const,
      tricks: 1,
    };
    expect(() => manager.act(code, tokens[1], edit)).toThrow(/хозяин/);
    try {
      manager.act(code, tokens[1], edit);
    } catch (e) {
      expect((e as LobbyError).status).toBe(403);
    }
    // Хозяин проходит проверку прав и упирается только в то, что раздача не сыграна.
    expect(() => manager.act(code, tokens[0], edit)).toThrow(/не сыграна/);
  });
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TurnirError, TurnirStore } from "./store";

const seed = {
  players: [{ name: "Аркаша" }, { name: "Настя" }],
  games: [],
};

function openStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "turnir-"));
  return new TurnirStore(path.join(dir, "turnir.json"), seed);
}

describe("журнал турнира", () => {
  it("на пустом диске начинает со списка игроков", () => {
    const store = openStore();
    expect(store.listPlayers().map((player) => player.name)).toEqual([
      "Аркаша",
      "Настя",
    ]);
    expect(store.listGames()).toEqual([]);
  });

  it("добавляет и удаляет игрока, не пускает повтор", () => {
    const store = openStore();
    store.addPlayer("  Ксюша  ");
    expect(store.listPlayers().map((player) => player.name)).toContain("Ксюша");
    expect(() => store.addPlayer("ксюша")).toThrow(TurnirError);
    store.deletePlayer("Ксюша");
    expect(store.listPlayers().map((player) => player.name)).not.toContain(
      "Ксюша",
    );
  });

  it("записывает игру и читает её заново с диска", () => {
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), "turnir-")),
      "turnir.json",
    );
    const store = new TurnirStore(file, seed);
    store.addGame({
      id: 42,
      date: "2026-10-10",
      players: [
        { name: "аркаша", points: 120, jokers: 2 },
        { name: "Настя", points: 80, jokers: 0 },
      ],
    });
    const again = new TurnirStore(file, seed);
    expect(again.listGames()).toEqual([
      {
        id: 42,
        date: "2026-10-10",
        players: [
          { name: "Аркаша", points: 120, jokers: 2 },
          { name: "Настя", points: 80, jokers: 0 },
        ],
      },
    ]);
    again.deleteGame("42");
    expect(again.listGames()).toEqual([]);
  });

  it("не принимает игру без двух разных игроков из списка", () => {
    const store = openStore();
    expect(() =>
      store.addGame({
        id: 1,
        date: "2026-10-10",
        players: [{ name: "Аркаша", points: 1, jokers: 0 }],
      }),
    ).toThrow(/минимум 2/);
    expect(() =>
      store.addGame({
        id: 2,
        date: "2026-10-10",
        players: [
          { name: "Аркаша", points: 1, jokers: 0 },
          { name: "Аркаша", points: 2, jokers: 0 },
        ],
      }),
    ).toThrow(/повторяются/);
    expect(() =>
      store.addGame({
        id: 3,
        date: "2026-10-10",
        players: [
          { name: "Аркаша", points: 1, jokers: 0 },
          { name: "Никто", points: 2, jokers: 0 },
        ],
      }),
    ).toThrow(/список/);
  });

  it("запись партии добавляет новых игроков и не затирает уже известных", () => {
    const store = openStore();
    store.recordResult({
      id: 7,
      date: "2026-10-10",
      players: [
        { name: "аркаша", points: 40, jokers: 3 },
        { name: "Новый", points: -10, jokers: 1 },
      ],
    });
    expect(store.listPlayers().map((player) => player.name)).toEqual([
      "Аркаша",
      "Настя",
      "Новый",
    ]);
    expect(store.listGames()[0].players[0]).toEqual({
      name: "Аркаша",
      points: 40,
      jokers: 3,
    });
  });
});

import { describe, expect, it } from "vitest";
import { createGame, settlement } from "../engine";
import { protocolDocument } from "../protocol-export";

describe("выгрузка протокола", () => {
  it("кладёт в бланк имена игроков и итоговую строку", () => {
    const game = createGame({ seed: 1, dealer: 0 });
    const html = protocolDocument(game, settlement(game));
    expect(html).toContain(game.players[0].name);
    expect(html).toContain(game.players[3].name);
    expect(html).toContain("Итого");
    expect(html).toContain("Очки НС");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
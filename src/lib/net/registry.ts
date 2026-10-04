import { LobbyManager } from "./lobby";

const KEY = Symbol.for("odessa-poker.lobby-manager");

type GlobalWithManager = typeof globalThis & { [KEY]?: LobbyManager };

/**
 * Один менеджер на процесс. Хранится в globalThis, потому что в dev-режиме
 * каждый маршрут может грузить модули заново, а лобби должны быть общими.
 */
export function lobbyManager(): LobbyManager {
  const holder = globalThis as GlobalWithManager;
  holder[KEY] ??= new LobbyManager();
  return holder[KEY];
}

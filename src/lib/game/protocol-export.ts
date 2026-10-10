import { buildScoreboard, totalJokers, type Settlement } from "./scoring";
import { PLAYER_IDS, type GameState } from "./types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function cell(value: number | null): string {
  return value === null ? "" : String(value);
}

function marked(text: string, jokers: number): string {
  if (!text || jokers <= 0) return escapeHtml(text);
  const cls = jokers === 1 ? "circle" : "box";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

/** Бланк протокола, как на бумаге, одним HTML-файлом. */
export function protocolDocument(state: GameState, settlement: Settlement): string {
  const rows = buildScoreboard(state.results, state.premiums);
  const names = state.players
    .map(
      (player) =>
        `<th colspan="2">${escapeHtml(player.name)}</th>`,
    )
    .join("");
  const subheads = state.players
    .map(() => "<th>заказ</th><th>счёт</th>")
    .join("");

  const body = rows
    .map((row) => {
      const cells = PLAYER_IDS.map((playerId) => {
        const entry = row.cells[playerId];
        if (row.race) {
          const race = row.race[playerId];
          const label = race.alive ? "в гонке" : "выбыл";
          return `<td colspan="2">${label} ${race.exact}/${row.blockSize ?? 0}</td>`;
        }
        const isNs = row.kind === "nabory" || row.kind === "slivy";
        const left = isNs
          ? entry.tricks
          : row.type === "premium"
            ? entry.points || null
            : entry.bid;
        const leftText =
          left === 0 && !isNs && row.type !== "premium" && row.played
            ? "—"
            : cell(left);
        const jokersOnLeft = isNs ? entry.jokers : 0;
        const jokersOnRight = isNs || row.type === "premium" ? 0 : entry.jokers;
        return `<td>${marked(leftText, jokersOnLeft)}</td><td>${marked(cell(entry.runningTotal), jokersOnRight)}</td>`;
      }).join("");
      return `<tr><td>${escapeHtml(row.label)}</td>${cells}</tr>`;
    })
    .join("");

  const summary = (
    label: string,
    values: number[],
    signed = false,
  ) => {
    const cells = values
      .map((value) => {
        const text = signed && value > 0 ? `+${value}` : String(value);
        return `<td colspan="2">${escapeHtml(text)}</td>`;
      })
      .join("");
    return `<tr class="sum"><td>${label}</td>${cells}</tr>`;
  };

  const jokers = totalJokers(state.results);
  const when = new Date().toLocaleString("ru-RU");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Протокол — Одесский покер</title>
<style>
  body { font-family: "Courier New", monospace; color: #1a1208; background: #f4efe4; margin: 24px; }
  h1 { font-family: Georgia, serif; font-weight: normal; letter-spacing: 0.08em; }
  p { color: #5c5146; }
  table { border-collapse: collapse; background: #fffdf8; }
  th, td { border: 1px solid #2a2118; padding: 4px 8px; text-align: center; }
  th { background: #efe6d6; }
  tr.sum td { font-weight: bold; }
  .circle { display: inline-block; min-width: 1.4em; border: 1.5px solid #1a1208; border-radius: 50%; padding: 0 4px; }
  .box { display: inline-block; min-width: 1.4em; border: 1.5px solid #1a1208; padding: 0 4px; }
</style>
</head>
<body>
  <h1>Одесский покер</h1>
  <p>Протокол партии. Выгружено ${escapeHtml(when)}. Кружок — один джокер на руках, прямоугольник — два.</p>
  <table>
    <thead>
      <tr><th>№</th>${names}</tr>
      <tr><th></th>${subheads}</tr>
    </thead>
    <tbody>
      ${body}
      ${summary("ОН", settlement.on)}
      ${summary("ОС", settlement.os)}
      ${summary("Сум НС", settlement.sumNs, true)}
      ${summary("Очки НС", settlement.pointsNs, true)}
      ${summary("Итого", settlement.total, true)}
      ${summary("Джокеры", jokers)}
    </tbody>
  </table>
</body>
</html>
`;
}

export function downloadProtocol(state: GameState, settlement: Settlement): void {
  const html = protocolDocument(state, settlement);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "protokol-odesskiy-poker.html";
  link.click();
  URL.revokeObjectURL(url);
}

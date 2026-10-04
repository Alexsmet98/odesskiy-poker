/**
 * Расписание партии из 43 строк протокола: 36 игровых раздач + 7 строк премии.
 * Порядок взят из спецификации правил (docs/game-rules.md).
 */

export type HandKind = "normal" | "dark" | "nabory" | "slivy";

export type HandRow = {
  type: "hand";
  /** Номер строки протокола, 1..43. */
  row: number;
  /** Индекс раздачи среди игровых раздач, 0..35. */
  handIndex: number;
  kind: HandKind;
  cards: number;
  /** Подпись строки в протоколе. */
  label: string;
};

export type PremiumRow = {
  type: "premium";
  row: number;
  /** Индексы раздач блока, за который считается премия. */
  blockHandIndices: number[];
  label: string;
};

export type ScheduleRow = HandRow | PremiumRow;

/**
 * Для тёмных, наборов и сливов расписание не задаёт число карт.
 * По протоколу суммы взяток в блоках наборов и сливов равны 36 = 4 × 9,
 * то есть эти раздачи играются полной рукой в 9 карт; тёмные — так же.
 */
export const FULL_HAND_CARDS = 9;

const NORMAL_BLOCKS: number[][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 9, 9, 9],
  [8, 7, 6, 5],
  [4, 3, 2, 1],
  [9, 9, 9, 9],
];

function buildSchedule(): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let handIndex = 0;

  const pushBlock = (
    kind: HandKind,
    sizes: number[],
    label: (cards: number) => string,
  ) => {
    const blockHandIndices: number[] = [];
    for (const cards of sizes) {
      rows.push({
        type: "hand",
        row: rows.length + 1,
        handIndex,
        kind,
        cards,
        label: label(cards),
      });
      blockHandIndices.push(handIndex);
      handIndex += 1;
    }
    return blockHandIndices;
  };

  const pushPremium = (blockHandIndices: number[]) => {
    rows.push({
      type: "premium",
      row: rows.length + 1,
      blockHandIndices,
      label: "Пр",
    });
  };

  for (const sizes of NORMAL_BLOCKS) {
    pushPremium(pushBlock("normal", sizes, (cards) => String(cards)));
  }

  pushPremium(pushBlock("dark", Array(4).fill(FULL_HAND_CARDS), () => "Т"));

  pushBlock("nabory", Array(4).fill(FULL_HAND_CARDS), () => "Н");
  pushBlock("slivy", Array(4).fill(FULL_HAND_CARDS), () => "С");

  return rows;
}

export const SCHEDULE: ScheduleRow[] = buildSchedule();

export const HAND_ROWS: HandRow[] = SCHEDULE.filter(
  (r): r is HandRow => r.type === "hand",
);

export const PREMIUM_ROWS: PremiumRow[] = SCHEDULE.filter(
  (r): r is PremiumRow => r.type === "premium",
);

export const TOTAL_HANDS = HAND_ROWS.length;

export function handRow(handIndex: number): HandRow {
  const row = HAND_ROWS[handIndex];
  if (!row) throw new Error(`Нет раздачи с индексом ${handIndex}`);
  return row;
}

/** В наборах и сливах торговли нет. */
export function hasBidding(kind: HandKind): boolean {
  return kind === "normal" || kind === "dark";
}

/** В тёмных торговля идёт до сдачи карт. */
export function isBlindBidding(kind: HandKind): boolean {
  return kind === "dark";
}

export const HAND_KIND_LABEL: Record<HandKind, string> = {
  normal: "обычная раздача",
  dark: "тёмные",
  nabory: "наборы",
  slivy: "сливы",
};

/** Русское склонение числительных: 1 взятка, 2 взятки, 5 взяток. */
export function plural(count: number, forms: [string, string, string]): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

export function tricksWord(count: number): string {
  return plural(count, ["взятка", "взятки", "взяток"]);
}

export function tricksCount(count: number): string {
  return `${count} ${tricksWord(count)}`;
}

/** «на 1 карту», «на 2 карты», «на 5 карт». */
export function cardsAccusative(count: number): string {
  return `${count} ${plural(count, ["карту", "карты", "карт"])}`;
}

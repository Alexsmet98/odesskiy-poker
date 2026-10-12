export type VoiceRoute = "direct" | "turn" | "unknown";

export type VoiceMeasure = {
  rttMs: number | null;
  lossPct: number | null;
  jitterMs: number | null;
  route: VoiceRoute;
};

/** Поля getStats(), которые нужны для строки диагностики. */
export type VoiceStatSample = {
  type: string;
  id: string;
  nominated?: boolean;
  state?: string;
  currentRoundTripTime?: number;
  selectedCandidatePairId?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  kind?: string;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
  roundTripTime?: number;
};

export type VoiceLinkLine = VoiceMeasure & {
  name: string;
  seat: number;
  state: string;
};

export type VoiceDiagnostics = {
  at: Date;
  turnConfigured: boolean;
  mic: "on" | "off" | "denied";
  playback: "ok" | "blocked";
  links: VoiceLinkLine[];
};

const EMPTY_MEASURE: VoiceMeasure = {
  rttMs: null,
  lossPct: null,
  jitterMs: null,
  route: "unknown",
};

/** Задержка, потери, jitter и маршрут по снимку getStats(). */
export function summarizeVoiceStats(samples: VoiceStatSample[]): VoiceMeasure {
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  const transport = samples.find(
    (sample) => sample.type === "transport" && sample.selectedCandidatePairId,
  );
  const pair =
    (transport?.selectedCandidatePairId
      ? byId.get(transport.selectedCandidatePairId)
      : undefined) ??
    samples.find(
      (sample) =>
        sample.type === "candidate-pair" &&
        sample.nominated === true &&
        sample.state === "succeeded",
    );

  const local = pair?.localCandidateId ? byId.get(pair.localCandidateId) : undefined;
  const remote = pair?.remoteCandidateId
    ? byId.get(pair.remoteCandidateId)
    : undefined;
  const route = routeOf(local?.candidateType, remote?.candidateType);

  const rttSeconds =
    pair?.currentRoundTripTime ??
    samples.find(
      (sample) =>
        sample.type === "remote-inbound-rtp" &&
        typeof sample.roundTripTime === "number",
    )?.roundTripTime;

  const inbound = samples.filter(
    (sample) =>
      sample.type === "inbound-rtp" &&
      (sample.kind === undefined || sample.kind === "audio"),
  );
  let lost = 0;
  let received = 0;
  let sawPackets = false;
  let jitterSeconds: number | null = null;
  for (const sample of inbound) {
    if (typeof sample.packetsLost === "number") {
      lost += sample.packetsLost;
      sawPackets = true;
    }
    if (typeof sample.packetsReceived === "number") {
      received += sample.packetsReceived;
      sawPackets = true;
    }
    if (typeof sample.jitter === "number") jitterSeconds = sample.jitter;
  }
  const total = lost + received;

  return {
    rttMs: typeof rttSeconds === "number" ? rttSeconds * 1000 : null,
    lossPct: sawPackets && total > 0 ? (Math.max(0, lost) / total) * 100 : null,
    jitterMs: jitterSeconds === null ? null : jitterSeconds * 1000,
    route,
  };
}

export function iceListHasTurn(
  servers: { urls?: string | string[] }[],
): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls)
      ? server.urls
      : server.urls
        ? [server.urls]
        : [];
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });
}

/** Текст для кнопки «Скопировать диагностику». Секретов TURN здесь нет. */
export function formatVoiceDiagnostics(report: VoiceDiagnostics): string {
  const lines = [
    "Одесский покер — голос",
    report.at.toISOString(),
    `TURN: ${report.turnConfigured ? "есть" : "нет"}`,
    `Микрофон: ${micLabel(report.mic)}`,
    `Воспроизведение: ${report.playback === "blocked" ? "заблокировано" : "разрешено"}`,
    "",
  ];
  if (report.links.length === 0) {
    lines.push("Нет других игроков.");
    return lines.join("\n");
  }
  for (const link of report.links) {
    const state = STATE_RU[link.state] ?? link.state;
    lines.push(
      `${link.name} (место ${link.seat + 1}): ${state} (${link.state}), задержка ${ms(link.rttMs)}, потери ${pct(link.lossPct)}, jitter ${jitter(link.jitterMs)}, маршрут ${routeLabel(link.route)}`,
    );
  }
  return lines.join("\n");
}

export function emptyMeasure(): VoiceMeasure {
  return { ...EMPTY_MEASURE };
}

const STATE_RU: Record<string, string> = {
  new: "подключение",
  connecting: "подключение",
  connected: "есть связь",
  disconnected: "обрыв",
  failed: "не вышло",
  closed: "закрыто",
};

function routeOf(local?: string, remote?: string): VoiceRoute {
  if (local === "relay" || remote === "relay") return "turn";
  if (local || remote) return "direct";
  return "unknown";
}

function micLabel(mic: VoiceDiagnostics["mic"]): string {
  if (mic === "on") return "включён";
  if (mic === "denied") return "запрещён";
  return "выключен";
}

function routeLabel(route: VoiceRoute): string {
  if (route === "turn") return "TURN";
  if (route === "direct") return "напрямую";
  return "нет";
}

function ms(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)} мс`;
}

function jitter(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)} мс`;
}

function pct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

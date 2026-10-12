/** Сколько ждать краткий обрыв, прежде чем трогать соединение. */
export const DISCONNECT_GRACE_MS = 3_000;

/** Паузы перед очередной попыткой: 2 с, затем 5 с, затем 10 с. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

export type Recovery = {
  /** restartIce для этого обрыва уже вызывался. */
  restartTried: boolean;
  /** Сколько отложенных попыток уже назначено. */
  used: number;
  gaveUp: boolean;
};

export type RecoveryStep =
  | { kind: "restart-now"; recovery: Recovery }
  | { kind: "restart"; recovery: Recovery; delayMs: number }
  | { kind: "recreate"; recovery: Recovery; delayMs: number }
  | { kind: "give-up"; recovery: Recovery };

export function freshRecovery(): Recovery {
  return { restartTried: false, used: 0, gaveUp: false };
}

/**
 * Обрыв продержался несколько секунд.
 * Первый раз сразу restartIce. Если он уже был — следующая попытка с паузой.
 */
export function afterGrace(recovery: Recovery): RecoveryStep {
  if (recovery.gaveUp) return { kind: "give-up", recovery };
  if (!recovery.restartTried) {
    return {
      kind: "restart-now",
      recovery: { ...recovery, restartTried: true },
    };
  }
  return takeDelay(recovery, "recreate");
}

/**
 * Соединение перешло в failed или restartIce не вернул связь.
 * Первая попытка — restartIce, следующие — новое соединение с этим игроком.
 */
export function afterFailure(recovery: Recovery): RecoveryStep {
  if (recovery.gaveUp) return { kind: "give-up", recovery };
  if (!recovery.restartTried) return takeDelay(recovery, "restart");
  return takeDelay(recovery, "recreate");
}

/** Пауза перед повтором запроса TURN. После 10 с интервал больше не растёт. */
export function iceRetryDelay(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

export function describeMicError(error: unknown): { text: string; denied: boolean } {
  const name = errorName(error);
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  ) {
    return { text: "Микрофон запрещён.", denied: true };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return { text: "Микрофон не найден.", denied: false };
  }
  return { text: "Браузер не дал микрофон.", denied: false };
}

function takeDelay(recovery: Recovery, kind: "restart" | "recreate"): RecoveryStep {
  if (recovery.used >= RETRY_DELAYS_MS.length) {
    return { kind: "give-up", recovery: { ...recovery, gaveUp: true } };
  }
  const delayMs = RETRY_DELAYS_MS[recovery.used];
  return {
    kind,
    delayMs,
    recovery: {
      restartTried: recovery.restartTried || kind === "restart",
      used: recovery.used + 1,
      gaveUp: false,
    },
  };
}

function errorName(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }
  return "";
}

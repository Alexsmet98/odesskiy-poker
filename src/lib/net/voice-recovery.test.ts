import { describe, expect, it } from "vitest";
import {
  DISCONNECT_GRACE_MS,
  RETRY_DELAYS_MS,
  afterFailure,
  afterGrace,
  describeMicError,
  freshRecovery,
  iceRetryDelay,
} from "./voice-recovery";

describe("восстановление голоса", () => {
  it("краткий обрыв сначала пережидает, потом сразу вызывает restartIce", () => {
    expect(DISCONNECT_GRACE_MS).toBe(3_000);
    const step = afterGrace(freshRecovery());
    expect(step.kind).toBe("restart-now");
    expect(step.recovery.restartTried).toBe(true);
    expect(step.recovery.used).toBe(0);
  });

  it("если restartIce не помог, дальше новое соединение через 2, 5 и 10 секунд", () => {
    let recovery = afterGrace(freshRecovery()).recovery;
    const delays: number[] = [];
    const kinds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const step = afterFailure(recovery);
      expect(step.kind).toBe("recreate");
      if (step.kind === "recreate") delays.push(step.delayMs);
      recovery = step.recovery;
      kinds.push(step.kind);
    }
    expect(delays).toEqual([...RETRY_DELAYS_MS]);
    expect(kinds).toEqual(["recreate", "recreate", "recreate"]);
    expect(afterFailure(recovery).kind).toBe("give-up");
  });

  it("сбой без предварительного обрыва ждёт 2 секунды и делает restartIce", () => {
    let step = afterFailure(freshRecovery());
    expect(step).toMatchObject({ kind: "restart", delayMs: 2_000 });
    step = afterFailure(step.recovery);
    expect(step).toMatchObject({ kind: "recreate", delayMs: 5_000 });
    step = afterFailure(step.recovery);
    expect(step).toMatchObject({ kind: "recreate", delayMs: 10_000 });
    step = afterFailure(step.recovery);
    expect(step.kind).toBe("give-up");
    expect(afterFailure(step.recovery).kind).toBe("give-up");
  });

  it("повтор загрузки TURN растёт до 10 секунд и дальше не частит", () => {
    expect([0, 1, 2, 3, 4].map(iceRetryDelay)).toEqual([
      2_000, 5_000, 10_000, 10_000, 10_000,
    ]);
  });

  it("отличает запрет микрофона от остальных отказов", () => {
    expect(describeMicError({ name: "NotAllowedError" })).toEqual({
      text: "Микрофон запрещён.",
      denied: true,
    });
    expect(describeMicError({ name: "NotFoundError" }).denied).toBe(false);
    expect(describeMicError(new Error("сеть")).text).toBe("Браузер не дал микрофон.");
  });
});

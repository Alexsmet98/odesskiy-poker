import { describe, expect, it } from "vitest";
import {
  formatVoiceDiagnostics,
  iceListHasTurn,
  summarizeVoiceStats,
  type VoiceStatSample,
} from "./voice-stats";

const PAIR: VoiceStatSample[] = [
  {
    type: "transport",
    id: "T1",
    selectedCandidatePairId: "P1",
  },
  {
    type: "candidate-pair",
    id: "P1",
    nominated: true,
    state: "succeeded",
    currentRoundTripTime: 0.084,
    localCandidateId: "L1",
    remoteCandidateId: "R1",
  },
  { type: "local-candidate", id: "L1", candidateType: "relay" },
  { type: "remote-candidate", id: "R1", candidateType: "srflx" },
  {
    type: "inbound-rtp",
    id: "A1",
    kind: "audio",
    packetsLost: 2,
    packetsReceived: 98,
    jitter: 0.012,
  },
];

describe("диагностика голоса", () => {
  it("считает задержку, потери, jitter и маршрут TURN", () => {
    expect(summarizeVoiceStats(PAIR)).toEqual({
      rttMs: 84,
      lossPct: 2,
      jitterMs: 12,
      route: "turn",
    });
  });

  it("считает host-пару прямым маршрутом", () => {
    const measure = summarizeVoiceStats([
      {
        type: "candidate-pair",
        id: "P1",
        nominated: true,
        state: "succeeded",
        localCandidateId: "L1",
        remoteCandidateId: "R1",
      },
      { type: "local-candidate", id: "L1", candidateType: "host" },
      { type: "remote-candidate", id: "R1", candidateType: "host" },
    ]);
    expect(measure.route).toBe("direct");
    expect(measure.rttMs).toBeNull();
  });

  it("узнаёт TURN в списке серверов и не путает его со STUN", () => {
    expect(iceListHasTurn([{ urls: "stun:stun.l.google.com:19302" }])).toBe(false);
    expect(
      iceListHasTurn([
        { urls: ["stun:stun.l.google.com:19302", "turn:odesskiypoker.com:3478"] },
      ]),
    ).toBe(true);
  });

  it("собирает текст, по которому видно маршрут и запрет микрофона", () => {
    const text = formatVoiceDiagnostics({
      at: new Date("2026-10-12T02:38:00.000Z"),
      turnConfigured: true,
      mic: "denied",
      playback: "blocked",
      links: [
        {
          name: "Вера",
          seat: 1,
          state: "connected",
          rttMs: 84,
          lossPct: 2,
          jitterMs: 12,
          route: "turn",
        },
      ],
    });
    expect(text).toContain("TURN: есть");
    expect(text).toContain("Микрофон: запрещён");
    expect(text).toContain("Воспроизведение: заблокировано");
    expect(text).toContain(
      "Вера (место 2): есть связь (connected), задержка 84 мс, потери 2.0%, jitter 12.0 мс, маршрут TURN",
    );
  });
});

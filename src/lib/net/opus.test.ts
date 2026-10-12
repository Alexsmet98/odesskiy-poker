import { describe, expect, it } from "vitest";
import { tuneOpusSdp } from "./opus";

const BASE = [
  "v=0",
  "o=- 1 1 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 0",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "a=rtpmap:0 PCMU/8000",
  "",
].join("\r\n");

describe("tuneOpusSdp", () => {
  it("ставит моно 32 кбит/с и оставляет чужие параметры", () => {
    const sdp = tuneOpusSdp(BASE);
    const fmtp = sdp
      .split(/\r?\n/)
      .find((line) => line.startsWith("a=fmtp:111 "));
    expect(fmtp).toBe(
      "a=fmtp:111 minptime=10;maxaveragebitrate=32000;stereo=0;sprop-stereo=0;useinbandfec=1",
    );
    expect(sdp).toContain("a=rtpmap:0 PCMU/8000");
    expect(sdp.endsWith("\r\n")).toBe(true);
  });

  it("заменяет уже стоящий битрейт и стерео, не дублируя ключи", () => {
    const sdp = tuneOpusSdp(
      [
        "a=rtpmap:111 opus/48000/2",
        "a=fmtp:111 minptime=10;maxaveragebitrate=64000;stereo=1;useinbandfec=1",
      ].join("\n"),
    );
    const fmtp = sdp.split("\n").find((line) => line.startsWith("a=fmtp:111 "));
    expect(fmtp).toBe(
      "a=fmtp:111 minptime=10;maxaveragebitrate=32000;stereo=0;sprop-stereo=0;useinbandfec=1",
    );
  });

  it("добавляет fmtp, если браузер его не прислал", () => {
    const sdp = tuneOpusSdp(
      ["m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=rtpmap:111 opus/48000/2"].join("\n"),
    );
    expect(sdp.split("\n")[2]).toBe(
      "a=fmtp:111 maxaveragebitrate=32000;stereo=0;sprop-stereo=0;useinbandfec=1",
    );
  });

  it("не трогает описание без Opus", () => {
    const raw = "m=audio 9 UDP/TLS/RTP/SAVPF 0\r\na=rtpmap:0 PCMU/8000\r\n";
    expect(tuneOpusSdp(raw)).toBe(raw);
  });
});

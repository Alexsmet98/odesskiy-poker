"use client";

import type { PlayerId } from "@/lib/game/types";
import {
  OPUS_MAX_AVERAGE_BITRATE,
  tuneOpusDescription,
} from "@/lib/net/opus";
import type { VoiceSignal } from "@/lib/net/voice";

const TALK_RMS = 0.02;
const RESEND_MS = 2_500;

export type PeerHandlers = {
  send: (signal: VoiceSignal) => void;
  onTalking: (talking: boolean) => void;
  onDown: (down: boolean) => void;
  audioContext: () => AudioContext;
};

/**
 * Одно WebRTC-соединение с местом за столом.
 * Меньший номер места при одновременных приглашениях оставляет своё,
 * больший — принимает чужое. Так приглашение, пришедшее пачкой, не теряется.
 */
export class TablePeer {
  private readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly audio = new Audio();
  private sender: RTCRtpSender | null = null;
  private chain: Promise<void> = Promise.resolve();
  private makingOffer = false;
  private ignoreOffer = false;
  private dirty = false;
  private closed = false;
  private failures = 0;
  private pendingIce: RTCIceCandidateInit[] = [];
  private resend: ReturnType<typeof setTimeout> | null = null;
  private stopLevel: (() => void) | null = null;

  constructor(
    private readonly remote: PlayerId,
    mySeat: PlayerId,
    iceServers: RTCIceServer[],
    private readonly handlers: PeerHandlers,
  ) {
    this.polite = mySeat > remote;
    this.audio.autoplay = true;
    this.audio.setAttribute("playsinline", "true");
    this.pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: "max-bundle",
    });
    this.pc.onnegotiationneeded = () => {
      void this.enqueue(() => this.offer());
    };
    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.handlers.send({
        kind: "ice",
        to: this.remote,
        candidate: event.candidate.toJSON(),
      });
    };
    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      const media = stream ?? new MediaStream([event.track]);
      this.audio.srcObject = media;
      this.resumePlayback();
      this.watch(media);
    };
    this.pc.onconnectionstatechange = () => {
      this.onConnection();
    };
    this.pc.onsignalingstatechange = () => {
      this.onSignaling();
    };
    const transceiver = this.pc.addTransceiver("audio", { direction: "recvonly" });
    this.sender = transceiver.sender;
    preferOpus(transceiver);
  }

  /** Включает или отпускает микрофон и заново договаривается о направлении. */
  setMic(track: MediaStreamTrack | null): Promise<void> {
    return this.enqueue(async () => {
      if (this.closed || !this.sender) return;
      try {
        await this.sender.replaceTrack(track);
        const transceiver = this.pc
          .getTransceivers()
          .find((item) => item.sender === this.sender);
        if (transceiver) {
          transceiver.direction = track ? "sendrecv" : "recvonly";
        }
        if (track) await this.capBitrate();
        this.dirty = true;
        await this.offer();
      } catch {
        this.dirty = true;
      }
    });
  }

  accept(signal: VoiceSignal): void {
    if (signal.kind === "mute" || signal.kind === "talk") return;
    void this.enqueue(() => this.apply(signal));
  }

  resumePlayback(): void {
    void this.audio.play().catch(() => {});
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.resend) clearTimeout(this.resend);
    this.stopLevel?.();
    this.handlers.onTalking(false);
    this.handlers.onDown(false);
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.onsignalingstatechange = null;
    this.pc.close();
    this.audio.pause();
    this.audio.srcObject = null;
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(task, task).then(
      () => undefined,
      () => undefined,
    );
    return this.chain;
  }

  private async offer(): Promise<void> {
    if (this.closed || this.makingOffer) return;
    if (this.pc.signalingState !== "stable") return;
    this.makingOffer = true;
    this.dirty = false;
    try {
      const created = await this.pc.createOffer();
      if (this.closed || this.pc.signalingState !== "stable") {
        this.dirty = true;
        return;
      }
      await this.pc.setLocalDescription(tuneOpusDescription(created));
      const sdp = this.pc.localDescription?.sdp;
      if (sdp) {
        this.handlers.send({ kind: "offer", to: this.remote, sdp });
      }
    } catch {
      this.dirty = true;
    } finally {
      this.makingOffer = false;
    }
  }

  private async apply(
    signal: Extract<VoiceSignal, { kind: "offer" | "answer" | "ice" }>,
  ): Promise<void> {
    if (this.closed) return;
    try {
      if (signal.kind === "ice") {
        if (this.ignoreOffer || !signal.candidate) return;
        await this.addIce(signal.candidate);
        return;
      }
      const collision =
        signal.kind === "offer" &&
        (this.makingOffer || this.pc.signalingState !== "stable");
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      if (collision && this.pc.signalingState === "have-local-offer") {
        try {
          await this.pc.setLocalDescription({ type: "rollback" });
        } catch {
          // браузер уже откатил своё приглашение
        }
      }
      await this.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp });
      await this.flushIce();
      if (signal.kind === "offer") {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(tuneOpusDescription(answer));
        const sdp = this.pc.localDescription?.sdp;
        if (sdp) {
          this.handlers.send({ kind: "answer", to: this.remote, sdp });
        }
      }
    } catch {
      // следующее приглашение или повтор через пару секунд соберёт канал заново
    }
  }

  private async addIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  private async flushIce(): Promise<void> {
    const queued = this.pendingIce.splice(0);
    for (const candidate of queued) {
      await this.pc.addIceCandidate(candidate);
    }
  }

  private onSignaling(): void {
    if (this.resend) clearTimeout(this.resend);
    if (this.closed) return;
    if (this.pc.signalingState === "stable" && this.dirty) {
      void this.enqueue(() => this.offer());
    }
    if (this.pc.signalingState !== "have-local-offer") return;
    this.resend = setTimeout(() => {
      const sdp = this.pc.localDescription?.sdp;
      if (this.closed || this.pc.signalingState !== "have-local-offer" || !sdp) {
        return;
      }
      this.handlers.send({ kind: "offer", to: this.remote, sdp });
    }, RESEND_MS);
  }

  private onConnection(): void {
    if (this.closed) return;
    const state = this.pc.connectionState;
    if (state === "connected") {
      this.failures = 0;
      this.handlers.onDown(false);
      void this.capBitrate();
      return;
    }
    if (state !== "failed") return;
    this.failures += 1;
    if (this.failures <= 2) {
      try {
        this.pc.restartIce();
      } catch {
        this.handlers.onDown(true);
      }
      return;
    }
    this.handlers.onDown(true);
  }

  private async capBitrate(): Promise<void> {
    if (!this.sender?.track) return;
    try {
      const params = this.sender.getParameters();
      const encodings = params.encodings.length > 0 ? params.encodings : [{}];
      encodings[0] = { ...encodings[0], maxBitrate: OPUS_MAX_AVERAGE_BITRATE };
      params.encodings = encodings;
      await this.sender.setParameters(params);
    } catch {
      // потолок уже записан в SDP
    }
  }

  private watch(stream: MediaStream): void {
    this.stopLevel?.();
    this.stopLevel = watchTalking(stream, this.handlers.audioContext, (talking) => {
      if (!this.closed) this.handlers.onTalking(talking);
    });
  }
}

/** Предпочитает Opus, оставляя остальные кодеки запасными. */
function preferOpus(transceiver: RTCRtpTransceiver): void {
  const caps = RTCRtpReceiver.getCapabilities?.("audio");
  if (!caps) return;
  const opus = caps.codecs.filter(
    (codec) => codec.mimeType.toLowerCase() === "audio/opus",
  );
  if (opus.length === 0) return;
  const rest = caps.codecs.filter(
    (codec) => codec.mimeType.toLowerCase() !== "audio/opus",
  );
  try {
    transceiver.setCodecPreferences([...opus, ...rest]);
  } catch {
    // старый браузер сам выберет Opus
  }
}

/** Следит за громкостью потока и сообщает, когда человек говорит. */
export function watchTalking(
  stream: MediaStream,
  audioContext: () => AudioContext,
  onTalking: (talking: boolean) => void,
): () => void {
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let talking = false;
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      energy += centered * centered;
    }
    const next = Math.sqrt(energy / data.length) > TALK_RMS;
    if (next === talking) return;
    talking = next;
    onTalking(talking);
  }, 100);
  return () => {
    clearInterval(timer);
    source.disconnect();
    analyser.disconnect();
    if (talking) onTalking(false);
  };
}

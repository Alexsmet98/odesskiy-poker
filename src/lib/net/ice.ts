import { createHmac } from "node:crypto";

const STUN: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };

/**
 * Серверы, через которые браузеры находят друг друга.
 * TURN берётся из окружения: без него голос работает не у всех пар сетей.
 * Секрет coturn (`use-auth-secret`) и адреса вида `turn:host:3478?transport=udp`.
 */
export function iceServers(): RTCIceServer[] {
  const secret = process.env.TURN_SECRET?.trim();
  const urls = process.env.TURN_URLS?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (!secret || !urls || urls.length === 0) return [STUN];

  const expiry = Math.floor(Date.now() / 1000) + 60 * 60;
  const username = `${expiry}:poker`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return [STUN, { urls, username, credential }];
}

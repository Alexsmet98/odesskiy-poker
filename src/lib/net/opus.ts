/** Средний потолок Opus для речи: моно, около 32 кбит/с. */
export const OPUS_MAX_AVERAGE_BITRATE = 32_000;

const OPUS_PARAMS = [
  `maxaveragebitrate=${OPUS_MAX_AVERAGE_BITRATE}`,
  "stereo=0",
  "sprop-stereo=0",
  "useinbandfec=1",
];

const REPLACED =
  /^(maxaveragebitrate|stereo|sprop-stereo|useinbandfec)=/i;

/**
 * Прописывает в локальный SDP моно-Opus: потолок 32 кбит/с и восстановление
 * части потерь. Чужие строки SDP не трогает.
 */
export function tuneOpusSdp(sdp: string): string {
  const lineEnd = sdp.includes("\r\n") ? "\r\n" : "\n";
  const trailing = /\r?\n$/.test(sdp);
  const lines = sdp.replace(/\r?\n$/, "").split(/\r?\n/);
  const rtpmap = /^a=rtpmap:(\d+)\s+opus\/48000(?:\/\d+)?/i;
  let payload: string | null = null;
  let rtpmapAt = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(rtpmap);
    if (!match) continue;
    payload = match[1];
    rtpmapAt = i;
    break;
  }
  if (!payload || rtpmapAt < 0) return sdp;

  const prefix = `a=fmtp:${payload} `;
  const fmtpAt = lines.findIndex((line) => line.startsWith(prefix));
  const tuned =
    fmtpAt >= 0 ? mergeFmtp(lines[fmtpAt].slice(prefix.length)) : OPUS_PARAMS.join(";");
  const fmtpLine = `${prefix}${tuned}`;
  if (fmtpAt >= 0) lines[fmtpAt] = fmtpLine;
  else lines.splice(rtpmapAt + 1, 0, fmtpLine);

  const body = lines.join(lineEnd);
  return trailing ? `${body}${lineEnd}` : body;
}

/** Та же правка для offer/answer перед setLocalDescription. */
export function tuneOpusDescription(
  description: RTCSessionDescriptionInit,
): RTCSessionDescriptionInit {
  if (!description.sdp) return description;
  return { type: description.type, sdp: tuneOpusSdp(description.sdp) };
}

function mergeFmtp(params: string): string {
  const kept = params
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !REPLACED.test(part));
  return [...kept, ...OPUS_PARAMS].join(";");
}

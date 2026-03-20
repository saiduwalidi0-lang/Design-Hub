function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function timestampSuffix(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(
    d.getSeconds()
  )}`;
}

export function makeBannerFilename(size: string, d = new Date()) {
  return `banner_${size}_${timestampSuffix(d)}.png`;
}

export function makeAvatarFrameFilename(kind: "frame" | "composite", d = new Date()) {
  const ts = timestampSuffix(d);
  return kind === "frame" ? `avatar_frame_transparent_${ts}.png` : `avatar_frame_composite_placeholder_${ts}.png`;
}


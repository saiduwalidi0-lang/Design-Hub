export function createDefaultAvatarPlaceholderDataUrl(size = 320) {
  const r = Math.floor(size * 0.34);
  const cx = size / 2;
  const cy = size / 2;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4F46E5"/>
      <stop offset="1" stop-color="#22C55E"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#111827"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

import { MIN_GENERATION_PIXELS } from "@/config/generationLimits";

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.floor(a));
  let y = Math.abs(Math.floor(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * 在保持「宽:高 = refW:refH（约分后整数倍）」的前提下，取满足总像素 ≥ minPixels 的最小一对 (w,h)。
 * 即各比例的「像素下限」档，避免无谓放大。
 */
export function sizeAtPixelFloor(refW: number, refH: number, minPixels = MIN_GENERATION_PIXELS): string {
  const g = gcd(refW, refH);
  const bw = refW / g;
  const bh = refH / g;
  const baseArea = bw * bh;
  const k = Math.ceil(Math.sqrt(minPixels / baseArea));
  return `${bw * k}x${bh * k}`;
}

/** 不足最小像素时使用的回退尺寸：总像素 = 方舟下限，且长边小于 3840×1024 方案 */
export const BANNER_UNDER_MIN_FALLBACK_SIZE = "2560x1440";

export type BannerSizePresetRow = {
  /** 传给接口的 size 字符串 */
  size: string;
  /** 设计参考比例（历史命名） */
  label: string;
};

const REFS: { refW: number; refH: number; label: string }[] = [
  { refW: 3712, refH: 1000, label: "≈ 3.71:1 宽屏" },
  { refW: 3920, refH: 944, label: "≈ 4.15:1" },
  { refW: 4488, refH: 824, label: "≈ 5.45:1 超宽" },
  { refW: 2560, refH: 1440, label: "16:9" },
  { refW: 3720, refH: 992, label: "≈ 3.75:1" },
];

export const BANNER_SIZE_PRESET_ROWS: BannerSizePresetRow[] = REFS.map(({ refW, refH, label }) => ({
  size: sizeAtPixelFloor(refW, refH),
  label,
}));

export const BANNER_SIZE_OPTIONS: string[] = BANNER_SIZE_PRESET_ROWS.map((r) => r.size);

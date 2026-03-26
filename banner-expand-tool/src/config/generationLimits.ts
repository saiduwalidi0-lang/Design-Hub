/**
 * 方舟图生图接口要求：总像素至少 3686400（官方报错原文）。
 * 可设 VITE_MIN_GENERATION_PIXELS 调高；若设得更低会自动钳制到该下限，避免请求被拒。
 */
export const ARK_MIN_IMAGE_PIXELS = 3_686_400;

const parsed = Number(import.meta.env.VITE_MIN_GENERATION_PIXELS);
const fromEnv = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : ARK_MIN_IMAGE_PIXELS;

export const MIN_GENERATION_PIXELS = Math.max(ARK_MIN_IMAGE_PIXELS, fromEnv);

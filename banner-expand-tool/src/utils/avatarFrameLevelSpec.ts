import type { AvatarFrameElementId, AvatarFrameLevel } from "@/types/avatarFrameTool";
import { fitImageIntoBox } from "@/utils/image";

/** Figma 270 槽位：主播 | 观众（观众 LV3 主元素等可独立配置） */
export type AvatarFrameFigmaLayoutKind = "anchor" | "viewer";

/** 与 Figma 插件 `avatarFrameLevelLayout.ts` 保持一致的 270×270 框位 */
/** 观众框圆环：整框贴图（中间透明），各档同尺寸 */
const L_ELEMENT4 = { x: 0, y: 0, width: 270, height: 270 };
const L_ELEMENT1 = { x: 87, y: 171, width: 96, height: 96 };
/** 观众 LV3 主元素：无旋转槽位，裁剪后同主播逻辑填入正方形（contain + bottomCenter） */
const VIEWER_L_ELEMENT1 = { x: 33, y: 170, width: 67, height: 67 };
const L_ELEMENT2 = { x: 15, y: 171, width: 240, height: 96 };
/**
 * 观众 LV3 环绕：240×96，**270 画板左上角为 (0,0)**，X/Y 为未旋转矩形的**左上角**（与 Figma Position 一致）。
 * 辅助测量：环绕框**几何中心**（红点）距 frame **左** 77px、距 **底** 77px → 中心 (77, 270−77)=(77,193)；
 * 左上 = 中心 − (120,48) → **(-43, 145)**。Figma 属性里常见 **-45°**；Canvas 顺时针为正，合成用 **+45°**（见 `getFigmaComposeRotationDeg`）。
 */
const VIEWER_L_ELEMENT2 = { x: -43, y: 145, width: 240, height: 96 };
/**
 * 观众 LV3 顶部：尺寸 **72.63×25.4**，绕中心旋转 ±45° 时 **AABB** 与标注一致：
 * 距框左/上/右/底 = **183 / 20 / 17.67 / 180.67** → AABB 宽/高 = 270−183−17.67 = **69.33**。
 * 几何中心 = AABB 中心 (183+34.665, 20+34.665)；**未旋转矩形左上** = 中心 − (w/2,h/2) → **(181.35, 41.965)**。
 * 合成仍用 `getFigmaComposeRotationDeg` +45°（对应 Figma -45°）。
 */
const VIEWER_L_ELEMENT3 = { x: 181.35, y: 41.965, width: 72.63, height: 25.4 };
const L_ELEMENT3 = { x: 75, y: 3, width: 120, height: 42 };
/** LV1/LV2（S/M）交付无顶饰槽，与主播规范一致 */
const ZERO_BOX = { x: 0, y: 0, width: 0, height: 0 };

const M_ELEMENT1 = { x: 87, y: 171, width: 96, height: 96 };
const M_ELEMENT2 = { x: 27.5, y: 171, width: 216, height: 96 };

const S_ELEMENT1 = { x: 99, y: 195, width: 72, height: 72 };
const S_ELEMENT2 = { x: 63, y: 195, width: 144, height: 72 };

const FIGMA_W = 270;
const FIGMA_FRAME_CENTER = FIGMA_W / 2;

const ALIGN: Record<AvatarFrameElementId, "center" | "topCenter" | "bottomCenter"> = {
  element4: "center",
  element1: "bottomCenter",
  element2: "center",
  element3: "topCenter",
};

function scaleBox(v: { x: number; y: number; width: number; height: number }, targetFrame: number) {
  const s = targetFrame / FIGMA_W;
  return {
    x: Math.round(v.x * s),
    y: Math.round(v.y * s),
    width: Math.round(v.width * s),
    height: Math.round(v.height * s),
  };
}

/** 仅 LV3（L 档）有顶饰；LV1/LV2 无顶部元素 */
export function avatarFrameLevelIncludesTop(level: AvatarFrameLevel): boolean {
  return level === "L";
}

export function getFigmaAlignForElement(
  id: AvatarFrameElementId,
  layout: AvatarFrameFigmaLayoutKind = "anchor"
): "center" | "topCenter" | "bottomCenter" {
  /** 观众顶部槽位较扁，居中 contain 更接近成稿；主播 L 仍用 topCenter */
  if (layout === "viewer" && id === "element3") return "center";
  return ALIGN[id];
}

export function getScaledFigmaBoxesForLevel(
  targetFrameWidth: number,
  level: AvatarFrameLevel,
  layout: AvatarFrameFigmaLayoutKind = "anchor"
): Record<AvatarFrameElementId, { x: number; y: number; width: number; height: number }> {
  /** 圆环仅观众框使用；主播交付不含 element4 */
  const e4 =
    layout === "viewer" ? scaleBox(L_ELEMENT4, targetFrameWidth) : scaleBox(ZERO_BOX, targetFrameWidth);
  if (level === "L") {
    const l1 = layout === "viewer" ? VIEWER_L_ELEMENT1 : L_ELEMENT1;
    const l2 = layout === "viewer" ? VIEWER_L_ELEMENT2 : L_ELEMENT2;
    const l3 = layout === "viewer" ? VIEWER_L_ELEMENT3 : L_ELEMENT3;
    return {
      element4: e4,
      element1: scaleBox(l1, targetFrameWidth),
      element2: scaleBox(l2, targetFrameWidth),
      element3: scaleBox(l3, targetFrameWidth),
    };
  }
  if (level === "M") {
    const e1 = scaleBox(M_ELEMENT1, targetFrameWidth);
    const e2 = scaleBox(M_ELEMENT2, targetFrameWidth);
    const e3 = scaleBox(ZERO_BOX, targetFrameWidth);
    return { element4: e4, element1: e1, element2: e2, element3: e3 };
  }
  const e1 = scaleBox(S_ELEMENT1, targetFrameWidth);
  const e2 = scaleBox(S_ELEMENT2, targetFrameWidth);
  const e3 = scaleBox(ZERO_BOX, targetFrameWidth);
  return { element4: e4, element1: e1, element2: e2, element3: e3 };
}

/**
 * Figma 合成时绕槽位中心旋转（度）。
 *
 * 观众环绕 / 顶部：**先**用 `fitImageIntoBox` 把抠图 contain 进槽位得到矩形填充图，**再**在合成里 `translate(槽位中心) → rotate → drawImage(±w/2,±h/2,w,h)`。
 * 画布预览若仍用原始图层 + 统一 `fit`，会与上述顺序不一致（角度/比例都会偏）。
 */
export function getFigmaComposeRotationDeg(
  elementId: AvatarFrameElementId,
  level: AvatarFrameLevel,
  layout: AvatarFrameFigmaLayoutKind
): number {
  if (level !== "L" || layout !== "viewer") return 0;
  if (elementId === "element2" || elementId === "element3") return 45;
  return 0;
}

/** 合成绘制顺序（自下而上）。主播：S/M 无顶、无圆环；观众：S/M 无顶、有圆环 */
export function getFigmaComposeOrderForLevel(
  level: AvatarFrameLevel,
  layout: AvatarFrameFigmaLayoutKind = "anchor"
): AvatarFrameElementId[] {
  if (layout === "viewer") {
    if (level === "L") return ["element4", "element2", "element3", "element1"];
    return ["element4", "element2", "element1"];
  }
  if (level === "L") return ["element2", "element3", "element1"];
  return ["element2", "element1"];
}

export const AVATAR_FRAME_LEVEL_LABELS: Record<AvatarFrameLevel, string> = {
  S: "LV1",
  M: "LV2",
  L: "LV3",
};

/**
 * 抠图后 `trimTransparentBounds` 的 alpha 下限。主元素默认用较高阈值，忽略极淡半透明边缘，
 * 否则包围盒偏大，进 Figma 槽位 `fitImageIntoBox` 后主体会显得偏小。
 */
export function avatarFrameTrimAlphaThreshold(elementId: AvatarFrameElementId): number {
  if (elementId === "element1") return 40;
  return 6;
}

const LEVELS_FOR_FILL: AvatarFrameLevel[] = ["L", "M", "S"];

/** 同一张抠图按 S/M/L 槽位分别 fit，不调用模型 */
export async function buildFigmaFillsForElementFromTrimmed(
  trimmedDataUrl: string,
  elementId: AvatarFrameElementId,
  targetFrameWidth: number,
  options?: { layout?: AvatarFrameFigmaLayoutKind }
): Promise<Partial<Record<AvatarFrameLevel, string>>> {
  const out: Partial<Record<AvatarFrameLevel, string>> = {};
  const layout = options?.layout ?? "anchor";
  const align = getFigmaAlignForElement(elementId, layout);
  for (const level of LEVELS_FOR_FILL) {
    const boxes = getScaledFigmaBoxesForLevel(targetFrameWidth, level, layout);
    const box = boxes[elementId];
    if (box.width <= 0 || box.height <= 0) continue;
    out[level] = await fitImageIntoBox(trimmedDataUrl, box.width, box.height, align, {
      allowScaleUp: true,
    });
  }
  return out;
}

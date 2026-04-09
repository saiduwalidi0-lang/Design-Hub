import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";

/**
 * 观众头像框（最少新图方案）
 *
 * - **只需新生成 1 张**：圆环（全画布尺寸、中间透明留给头像，与主画布同分辨率）。
 * - **主元素 / 环绕 / 顶部**：继续用主播框同款 `main.png`、`surround.png`、`top.png`，
 *   不强制重跑图生图，仅靠 **x / y / rotate / scale** 摆出截图中的相对位置。
 * - 下方数值为起点，请对照成稿在面板里微调或改本文件。
 */
export const AVATAR_FRAME_VIEWER_TRANSFORM_OVERRIDES: Partial<
  Record<AvatarFrameElementId, Pick<AvatarFrameElement, "x" | "y" | "rotate" | "scale">>
> = {
  element4: { x: 0, y: 0, rotate: 0, scale: 1 },
  /**
   * 环绕：有 `figmaFillByLevelViewer.L` 时画布与 Figma 一致（先 fit 进槽位再旋转）；旋转基准见 `getFigmaComposeRotationDeg`，此处 rotate 为**额外微调**（度），默认 0。
   */
  element2: { x: 0, y: 0, rotate: 0, scale: 1 },
  /** 主元素不旋转；Figma LV3 槽位见 avatarFrameLevelSpec VIEWER_L_ELEMENT1 */
  element1: { x: -20, y: 12, rotate: 0, scale: 1 },
  /**
   * 顶部：有 `figmaFillByLevelViewer.L` 时与 Figma 一致（先 fit 进 `VIEWER_L_ELEMENT3` 再旋转）；`getFigmaComposeRotationDeg` 为规范角，此处为微调。
   */
  element3: { x: 0, y: 0, rotate: 0, scale: 1 },
};

export function applyViewerTransformPreset(elements: AvatarFrameElement[]): AvatarFrameElement[] {
  return elements.map((e) => {
    const o = AVATAR_FRAME_VIEWER_TRANSFORM_OVERRIDES[e.id];
    return o ? { ...e, ...o } : e;
  });
}

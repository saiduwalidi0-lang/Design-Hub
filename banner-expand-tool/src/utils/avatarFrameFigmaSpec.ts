import type { AvatarFrameElementId } from "@/types/avatarFrameTool";

export const AVATAR_FRAME_FIGMA_FRAME = { width: 270, height: 270 } as const;

export const AVATAR_FRAME_FIGMA_TARGET_FRAME = { width: 1024, height: 1024 } as const;

export const AVATAR_FRAME_FIGMA_BOXES: Record<AvatarFrameElementId, { x: number; y: number; width: number; height: number }> = {
  element1: { x: 87, y: 171, width: 96, height: 96 },
  element2: { x: 15, y: 171, width: 240, height: 96 },
  element3: { x: 75, y: 3, width: 120, height: 42 },
};

export const AVATAR_FRAME_FIGMA_ALIGN: Record<AvatarFrameElementId, "center" | "topCenter" | "bottomCenter"> = {
  element1: "bottomCenter",
  element2: "center",
  element3: "topCenter",
};

export function scaleFigmaBox(v: { x: number; y: number; width: number; height: number }, targetFrame: number) {
  const s = targetFrame / AVATAR_FRAME_FIGMA_FRAME.width;
  return {
    x: Math.round(v.x * s),
    y: Math.round(v.y * s),
    width: Math.round(v.width * s),
    height: Math.round(v.height * s),
  };
}

export function getScaledFigmaBoxes(targetFrame: number) {
  return {
    element1: scaleFigmaBox(AVATAR_FRAME_FIGMA_BOXES.element1, targetFrame),
    element2: scaleFigmaBox(AVATAR_FRAME_FIGMA_BOXES.element2, targetFrame),
    element3: scaleFigmaBox(AVATAR_FRAME_FIGMA_BOXES.element3, targetFrame),
  } satisfies Record<AvatarFrameElementId, { x: number; y: number; width: number; height: number }>;
}

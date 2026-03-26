/**
 * 主播头像框三档（S/M/L）在 **交付 Frame 270×270** 下的元素框位（左上角原点）。
 *
 * - **L 档**：固定为历史默认，请勿改。
 * - **S / M 档**：只改下面 `M_ELEMENT*`、`S_ELEMENT*` 共 8 个数字（主元素 + 环绕各一组 x,y,width,height）。
 *   无顶部图层；`element3` 仅在 L 使用。
 */

export type AvatarFrameLevel = 'S' | 'M' | 'L';

export type AvatarFrameElementBox = { x: number; y: number; width: number; height: number };

// ── L（不变）────────────────────────────────────────────
const L_ELEMENT1: AvatarFrameElementBox = { x: 87, y: 171, width: 96, height: 96 };
const L_ELEMENT2: AvatarFrameElementBox = { x: 15, y: 171, width: 240, height: 96 };
const L_ELEMENT3: AvatarFrameElementBox = { x: 75, y: 3, width: 120, height: 42 };

// ── M（LV2）— 请替换为你的设计稿数值 ──────────────────
const M_ELEMENT1: AvatarFrameElementBox = { x: 87, y: 171, width: 96, height: 96 };
const M_ELEMENT2: AvatarFrameElementBox = { x: 27.5, y: 171, width: 216, height: 96 };

// ── S（LV1）— 请替换为你的设计稿数值 ──────────────────
const S_ELEMENT1: AvatarFrameElementBox = { x: 99, y: 195, width: 72, height: 72 };
const S_ELEMENT2: AvatarFrameElementBox = { x: 63, y: 195, width: 144, height: 72 };

const FIGMA_W = 270;
const FIGMA_H = 270;

export function avatarFrameLevelIncludesTop(level: AvatarFrameLevel): boolean {
  return level === 'L';
}

/** 发给 API 的 spec 片段（含 boxes，供服务端合成与 mock 使用） */
export function buildAvatarFrameSpecForLevel(level: AvatarFrameLevel) {
  const base = {
    level,
    figmaFrame: { width: FIGMA_W, height: FIGMA_H },
    targetFrame: { width: 1024, height: 1024 },
  };

  if (level === 'L') {
    return {
      ...base,
      boxes: {
        element1: { ...L_ELEMENT1, align: 'bottomCenter' as const },
        element2: { ...L_ELEMENT2, align: 'center' as const },
        element3: { ...L_ELEMENT3, align: 'topCenter' as const },
      },
    };
  }

  if (level === 'M') {
    return {
      ...base,
      boxes: {
        element1: { ...M_ELEMENT1, align: 'bottomCenter' as const },
        element2: { ...M_ELEMENT2, align: 'center' as const },
      },
    };
  }

  return {
    ...base,
    boxes: {
      element1: { ...S_ELEMENT1, align: 'bottomCenter' as const },
      element2: { ...S_ELEMENT2, align: 'center' as const },
    },
  };
}

/** 供浏览器 mock（MockSpec）使用 */
export function buildMockSpecBoxesForLevel(level: AvatarFrameLevel): {
  figmaFrame: { width: number; height: number };
  targetFrame: { width: number; height: number };
  boxes: {
    element1: AvatarFrameElementBox;
    element2: AvatarFrameElementBox;
    element3: AvatarFrameElementBox;
  };
} {
  const s = buildAvatarFrameSpecForLevel(level);
  const b = s.boxes as Record<string, AvatarFrameElementBox & { align?: string }>;
  return {
    figmaFrame: s.figmaFrame,
    targetFrame: s.targetFrame,
    boxes: {
      element1: { x: b.element1.x, y: b.element1.y, width: b.element1.width, height: b.element1.height },
      element2: { x: b.element2.x, y: b.element2.y, width: b.element2.width, height: b.element2.height },
      element3:
        'element3' in b && b.element3
          ? { x: b.element3.x, y: b.element3.y, width: b.element3.width, height: b.element3.height }
          : { x: 0, y: 0, width: 0, height: 0 },
    },
  };
}

export function getWriteBoxesForLevel(level: AvatarFrameLevel): {
  element1: AvatarFrameElementBox;
  element2: AvatarFrameElementBox;
  element3: AvatarFrameElementBox | null;
} {
  const spec = buildAvatarFrameSpecForLevel(level);
  const b = spec.boxes as Record<string, AvatarFrameElementBox & { align?: string }>;
  if (!('element3' in b) || !b.element3) {
    return {
      element1: { x: b.element1.x, y: b.element1.y, width: b.element1.width, height: b.element1.height },
      element2: { x: b.element2.x, y: b.element2.y, width: b.element2.width, height: b.element2.height },
      element3: null,
    };
  }
  return {
    element1: { x: b.element1.x, y: b.element1.y, width: b.element1.width, height: b.element1.height },
    element2: { x: b.element2.x, y: b.element2.y, width: b.element2.width, height: b.element2.height },
    element3: { x: b.element3.x, y: b.element3.y, width: b.element3.width, height: b.element3.height },
  };
}

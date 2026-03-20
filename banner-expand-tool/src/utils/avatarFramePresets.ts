import type { AvatarFrameElement, AvatarFrameElementId } from "@/types/avatarFrameTool";

export type AvatarFrameCandidate = {
  id: string;
  name: string;
  order: AvatarFrameElementId[];
  elements: AvatarFrameElement[];
};

function cloneElements(elements: AvatarFrameElement[]) {
  return elements.map((e) => ({ ...e }));
}

function patch(elements: AvatarFrameElement[], id: AvatarFrameElementId, p: Partial<AvatarFrameElement>) {
  return elements.map((e) => (e.id === id ? { ...e, ...p } : e));
}

export function buildAvatarFrameCandidates(
  elements: AvatarFrameElement[],
  order: AvatarFrameElementId[],
  strictMode: boolean
): AvatarFrameCandidate[] {
  const base = cloneElements(elements);
  const candidates: AvatarFrameCandidate[] = [];

  candidates.push({
    id: "base",
    name: "方案 A（默认）",
    elements: base,
    order: order.slice(),
  });

  if (strictMode) {
    candidates.push({
      id: "order1",
      name: "方案 B（顶部覆盖）",
      elements: cloneElements(elements),
      order: ["element2", "element1", "element3"],
    });
    candidates.push({
      id: "order2",
      name: "方案 C（环绕覆盖）",
      elements: cloneElements(elements),
      order: ["element1", "element3", "element2"],
    });
    candidates.push({
      id: "order3",
      name: "方案 D（主元素覆盖）",
      elements: cloneElements(elements),
      order: ["element2", "element3", "element1"],
    });
  } else {
    candidates.push({
      id: "wide",
      name: "方案 B（环绕更展开）",
      elements: patch(patch(cloneElements(elements), "element2", { scale: 1.08, rotate: 8, y: 12 }), "element3", {
        y: -110,
        scale: 1.02,
      }),
      order: order.slice(),
    });

    candidates.push({
      id: "tight",
      name: "方案 C（环绕更紧凑）",
      elements: patch(patch(cloneElements(elements), "element2", { scale: 0.96, rotate: -8, y: 18 }), "element3", {
        y: -120,
        scale: 0.98,
      }),
      order: order.slice(),
    });

    candidates.push({
      id: "topFront",
      name: "方案 D（顶部更靠前）",
      elements: patch(patch(cloneElements(elements), "element3", { y: -96, scale: 1.06 }), "element2", {
        y: 22,
        scale: 1.02,
      }),
      order: ["element2", "element1", "element3"],
    });
  }

  return candidates;
}

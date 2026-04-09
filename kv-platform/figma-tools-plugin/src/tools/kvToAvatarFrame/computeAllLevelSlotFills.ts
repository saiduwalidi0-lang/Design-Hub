import {
  type AvatarFrameLevel,
  avatarFrameLevelIncludesTop,
  getWriteBoxesForLevel,
} from '@/tools/kvToAvatarFrame/avatarFrameLevelLayout';
import { fitImageIntoBox } from '@/tools/kvToAvatarFrame/avatarFrameFigmaFill';

export type SlotFillsForLevel = {
  element1: string;
  element2: string;
  element3?: string;
};

const LEVELS: AvatarFrameLevel[] = ['L', 'M', 'S'];

/** 三张抠图共用，按 S/M/L 槽位分别生成贴图（270 坐标系下的槽位宽高） */
export async function computeAllLevelSlotFills(
  trimmed1: string,
  trimmed2: string,
  trimmed3: string
): Promise<Record<AvatarFrameLevel, SlotFillsForLevel>> {
  const out = {} as Record<AvatarFrameLevel, SlotFillsForLevel>;
  for (const level of LEVELS) {
    const wb = getWriteBoxesForLevel(level);
    const element1 = await fitImageIntoBox(trimmed1, wb.element1.width, wb.element1.height, 'bottomCenter', {
      allowScaleUp: true,
    });
    const element2 = await fitImageIntoBox(trimmed2, wb.element2.width, wb.element2.height, 'center', {
      allowScaleUp: true,
    });
    if (wb.element3 && avatarFrameLevelIncludesTop(level)) {
      const element3 = await fitImageIntoBox(trimmed3, wb.element3.width, wb.element3.height, 'topCenter', {
        allowScaleUp: true,
      });
      out[level] = { element1, element2, element3 };
    } else {
      out[level] = { element1, element2 };
    }
  }
  return out;
}

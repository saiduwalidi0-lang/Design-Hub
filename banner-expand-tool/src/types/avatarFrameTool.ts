export type AvatarFrameElementId = "element1" | "element2" | "element3" | "element4";

/** S=LV1，M=LV2，L=LV3（与 Figma 插件档位一致） */
export type AvatarFrameLevel = "S" | "M" | "L";

/** Avatar auto-cutout after image generation */
export type AvatarFrameCutoutMethod = "threshold" | "rmbgLocal" | "comfyuiRmbg" | "byteArtist";

export type AvatarFrameElement = {
  id: AvatarFrameElementId;
  label: string;
  required: boolean;
  visible: boolean;
  dataUrl?: string;
  generatedDataUrl?: string;
  generatedHistory?: string[];
  croppedDataUrl?: string;
  croppedHistory?: string[];
  figmaFillDataUrl?: string;
  /** 各档位 Figma 槽位填充（同一张抠图按框缩放，无需重新出图）——主播槽位 */
  figmaFillByLevel?: Partial<Record<AvatarFrameLevel, string>>;
  /** 观众槽位（与 figmaFillByLevel 同一次生成写入；LV3 等与主播不同的框位用此图） */
  figmaFillByLevelViewer?: Partial<Record<AvatarFrameLevel, string>>;
  figmaFillHistory?: string[];
  naturalWidth?: number;
  naturalHeight?: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
};

export type AvatarFrameResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      framePngDataUrl: string;
      compositePngDataUrl: string;
    };

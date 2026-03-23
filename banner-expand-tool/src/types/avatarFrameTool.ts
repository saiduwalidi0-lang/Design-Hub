export type AvatarFrameElementId = "element1" | "element2" | "element3";

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

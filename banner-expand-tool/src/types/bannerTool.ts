export type UploadState =
  | { status: "empty" }
  | {
      status: "ready";
      file: File;
      dataUrl: string;
      width?: number;
      height?: number;
    };

export type ResultState =
  | { status: "idle" }
  | { status: "loading"; total: number; done: number; currentSize?: string }
  | { status: "error"; message: string }
  | {
      status: "success";
      items: Array<{
        size: string;
        previewUrl: string;
        remoteUrl?: string;
        blob?: Blob;
      }>;
    };

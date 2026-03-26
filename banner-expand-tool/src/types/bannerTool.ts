export type UploadState =
  | { status: "empty" }
  | {
      status: "ready";
      file: File;
      dataUrl: string;
      width?: number;
      height?: number;
    };

/** Banner 单条结果（成功态与生成中的 partial 共用） */
export type BannerResultItem = {
  size: string;
  previewUrl: string;
  remoteUrl?: string;
  blob?: Blob;
  generateMs?: number;
  referenceUpdateMs?: number;
};

export type ResultState =
  | { status: "idle" }
  | {
      status: "loading";
      total: number;
      done: number;
      currentSize?: string;
      /** 已生成完成的条目，边生成边追加 */
      partialItems?: BannerResultItem[];
    }
  | { status: "error"; message: string }
  | {
      status: "success";
      items: BannerResultItem[];
    };

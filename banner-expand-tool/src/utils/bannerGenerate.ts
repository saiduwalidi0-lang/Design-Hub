import { arkGenerateImage } from "@/utils/ark";
import { blobToDataUrl, base64ToBlob } from "@/utils/image";
import { normalizeBannerGenerationSize } from "@/utils/size";

export type BannerGenerateItem = {
  size: string;
  previewUrl: string;
  remoteUrl?: string;
  blob?: Blob;
};

type BannerGenerateParams = {
  endpoint: string;
  apiKey: string;
  model: string;
  referenceFieldName: string;
  referenceEncoding: "data_url" | "base64";
  watermark: boolean;
  uploadDataUrl: string;
  prompt: string;
  selectedSizes: string[];
  chainConsistency: boolean;
  onProgress: (p: { total: number; done: number; currentSize?: string }) => void;
};

function parseSize(size: string) {
  const m = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/.exec(size);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

function aspectRatio(size: string) {
  const p = parseSize(size);
  if (!p || p.h === 0) return Number.POSITIVE_INFINITY;
  return p.w / p.h;
}

function orderSizesForConsistency(sizes: string[]) {
  const tall: string[] = [];
  const wide: string[] = [];
  for (const s of sizes) {
    const r = aspectRatio(s);
    if (r <= 2.05) tall.push(s);
    else wide.push(s);
  }
  wide.sort((a, b) => aspectRatio(a) - aspectRatio(b));
  tall.sort((a, b) => aspectRatio(a) - aspectRatio(b));
  return { tall, wide };
}

export async function generateBannerSet(params: BannerGenerateParams): Promise<BannerGenerateItem[]> {
  const minPixels = 3686400;
  const normalizedSelected = params.selectedSizes.map((s) => normalizeBannerGenerationSize(s, minPixels));
  const uniqueSelected = Array.from(new Set(normalizedSelected));
  const { wide, tall } = orderSizesForConsistency(uniqueSelected);
  const groups = [wide, tall].filter((g) => g.length > 0);
  const total = uniqueSelected.length;

  const items: BannerGenerateItem[] = [];
  let done = 0;

  for (const group of groups) {
    let referenceDataUrl = params.uploadDataUrl;
    for (const size of group) {
      params.onProgress({ total, done, currentSize: size });
      const res = await arkGenerateImage({
        endpoint: params.endpoint,
        apiKey: params.apiKey,
        model: params.model,
        prompt: params.prompt,
        size,
        stream: false,
        watermark: params.watermark,
        sequentialImageGeneration: "disabled",
        responseFormat: "b64_json",
        referenceFieldName: params.referenceFieldName,
        referenceEncoding: params.referenceEncoding,
        referenceImageDataUrl: referenceDataUrl,
      });

      let blob: Blob | undefined;
      let previewUrl: string;
      if (res.b64Json) {
        blob = base64ToBlob(res.b64Json);
        previewUrl = URL.createObjectURL(blob);
      } else if (res.url) {
        previewUrl = res.url;
      } else {
        throw new Error("未获取到结果图片");
      }

      items.push({ size, previewUrl, remoteUrl: res.url, blob });
      done += 1;

      if (params.chainConsistency && blob) referenceDataUrl = await blobToDataUrl(blob);
      else referenceDataUrl = params.uploadDataUrl;
    }
  }

  params.onProgress({ total, done });
  return items;
}

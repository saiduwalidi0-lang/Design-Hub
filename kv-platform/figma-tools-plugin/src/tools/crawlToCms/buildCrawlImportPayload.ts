import type { AssetKey, CrawledAssetMeta } from '@/figma/bridge';

export type CrawledAsset = CrawledAssetMeta & { bytes: Uint8Array };

type ImageItem = { id: string; url: string };

type AvatarFrameImage = ImageItem & { type: string; level: string };

type Images = Partial<Record<AssetKey, Array<ImageItem | AvatarFrameImage>>>;

export function buildCrawlImportPayload(input: { assets: CrawledAsset[] }) {
  const byTitle = new Map<string, CrawledAsset[]>();
  for (const a of input.assets) {
    const key = a.title || a.pageName;
    const arr = byTitle.get(key) || [];
    arr.push(a);
    byTitle.set(key, arr);
  }

  const items: Array<{
    title: string;
    date: string;
    designer: string;
    region: string;
    level: string;
    figmaUrl: string;
    imageUrl: string;
    categories: Record<string, string>;
    images: Images;
    isIP: boolean;
  }> = [];
  const files: Array<{ fileIndex: number; name: string; bytes: Uint8Array }> = [];
  let fileIndex = 0;

  for (const [title, arr] of byTitle.entries()) {
    const first = arr[0];
    const images: Images = {};

    for (const a of arr) {
      const url = `file:${fileIndex}`;
      const img: ImageItem = { id: `${a.nodeId}-${fileIndex}`, url };

      if (a.assetKey === 'avatarFrame') {
        const typed: AvatarFrameImage = { ...img, type: 'Creator', level: 'LV1' };
        const list = (images.avatarFrame as AvatarFrameImage[] | undefined) || [];
        list.push(typed);
        images.avatarFrame = list;
      } else {
        const list = (images[a.assetKey] as ImageItem[] | undefined) || [];
        list.push(img);
        images[a.assetKey] = list;
      }

      files.push({
        fileIndex,
        name: `${a.assetKey}-${a.name || 'asset'}-${fileIndex}.png`,
        bytes: a.bytes,
      });
      fileIndex++;
    }

    const kvUrl = (images.kv && (images.kv[0] as ImageItem | undefined)?.url) || '';

    items.push({
      title,
      date: new Date().toISOString().slice(0, 10),
      designer: '',
      region: first.region || 'GLOBAL',
      level: first.level || 'TOP',
      figmaUrl: first.figmaUrl || '',
      imageUrl: kvUrl,
      categories: {},
      images,
      isIP: false,
    });
  }

  return { items, files };
}

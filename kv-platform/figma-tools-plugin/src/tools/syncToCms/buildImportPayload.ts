import { categorizeNodeName, type AssetKey } from '@/tools/syncToCms/categorize';

export type ExportedItem = {
  id: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
  bytes: Uint8Array;
};

export type PreviewImageItem = { id: string; url: string };
export type AvatarFrameImageItem = PreviewImageItem & { type: string; level: string };

export type PreviewItem = {
  title: string;
  date: string;
  designer?: string;
  region: string;
  level: string;
  figmaUrl?: string;
  categories?: Record<string, string>;
  isIP?: boolean;
  imageUrl?: string;
  images: Partial<Record<AssetKey, Array<PreviewImageItem> | Array<AvatarFrameImageItem>>>;
};

function parseRegionFromTitle(title: string) {
  const t = String(title || '').trim();
  const m = t.match(/-\s*([A-Za-z]{2,5})\s*$/);
  return m ? m[1].toUpperCase() : '';
}

export function buildImportPayload(input: {
  exported: ExportedItem[];
  fileKey?: string;
  date?: string;
  defaultLevel?: string;
}) {
  const date = input.date || new Date().toISOString().slice(0, 10);
  const defaultLevel = input.defaultLevel || 'TOP';

  const byPage = new Map<string, ExportedItem[]>();
  for (const item of input.exported) {
    const list = byPage.get(item.pageName) || [];
    list.push(item);
    byPage.set(item.pageName, list);
  }

  const items: PreviewItem[] = [];
  const files: { fileIndex: number; name: string; bytes: Uint8Array }[] = [];

  let globalIndex = 0;
  for (const [pageName, nodes] of byPage.entries()) {
    const region = parseRegionFromTitle(pageName) || 'GLOBAL';
    const images: PreviewItem['images'] = {};

    for (const node of nodes) {
      const assetKey = categorizeNodeName(node.name);
      const fileRef = `file:${globalIndex}`;
      const imgBase = { id: `${node.id}-${globalIndex}`, url: fileRef };
      if (assetKey === 'avatarFrame') {
        const list = (images.avatarFrame || []) as AvatarFrameImageItem[];
        list.push({ ...imgBase, type: 'Creator', level: 'LV1' });
        images.avatarFrame = list;
      } else {
        const list = (images[assetKey] || []) as PreviewImageItem[];
        list.push(imgBase);
        images[assetKey] = list;
      }

      files.push({ fileIndex: globalIndex, name: `${node.name || 'asset'}-${globalIndex}.png`, bytes: node.bytes });
      globalIndex++;
    }

    const firstKv = (images.kv as PreviewImageItem[] | undefined)?.[0]?.url;
    const figmaUrl = input.fileKey ? `https://www.figma.com/file/${input.fileKey}` : undefined;
    items.push({
      title: pageName,
      date,
      region,
      level: defaultLevel,
      figmaUrl,
      imageUrl: firstKv,
      images,
    });
  }

  return { items, files };
}


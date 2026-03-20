export type ExportMode = 'selection' | 'page';

export type CrawlMode = 'currentFile';

export type PluginRequest =
  | { type: 'PING' }
  | { type: 'EXPORT_NODES'; mode: ExportMode; scale: number }
  | { type: 'CRAWL_FILE'; mode: CrawlMode; scale: number }
  | { type: 'EXPORT_KV_FROM_SELECTION'; scale: number }
  | {
      type: 'WRITE_AVATARFRAME_TO_CANVAS';
      frameSize: number;
      images: {
        element1Png: Uint8Array;
        element2Png: Uint8Array;
        element3Png: Uint8Array;
        compositePng: Uint8Array;
      };
      names?: {
        frame?: string;
        element1?: string;
        element2?: string;
        element3?: string;
        composite?: string;
      };
    };

export type ExportedNodeMeta = {
  id: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
};

export type PluginResponse =
  | { type: 'PONG'; fileKey: string | undefined }
  | { type: 'EXPORT_START'; total: number }
  | { type: 'EXPORT_ITEM'; index: number; total: number; node: ExportedNodeMeta; bytes: Uint8Array }
  | { type: 'EXPORT_DONE'; total: number }
  | { type: 'EXPORT_ERROR'; message: string }
  | { type: 'KV_EXPORT_RESULT'; node: ExportedNodeMeta; bytes: Uint8Array; kv: unknown }
  | { type: 'KV_EXPORT_ERROR'; message: string }
  | { type: 'CRAWL_START'; totalAssets: number; totalPages: number }
  | { type: 'CRAWL_ASSET'; index: number; total: number; asset: CrawledAssetMeta; bytes: Uint8Array }
  | { type: 'CRAWL_DONE'; totalAssets: number }
  | { type: 'CRAWL_ERROR'; message: string }
  | { type: 'WRITE_AVATARFRAME_DONE'; frameNodeId: string }
  | { type: 'WRITE_AVATARFRAME_ERROR'; message: string };

export type AssetKey = 'kv' | 'h5' | 'banner1029x276' | 'banner750x500' | 'avatarFrame' | 'icons';

export type CrawledAssetMeta = {
  nodeId: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
  assetKey: AssetKey;
  title: string;
  region: string;
  level: string;
  figmaUrl?: string;
};

export function postToPlugin(message: PluginRequest) {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;
  window.parent.postMessage({ pluginMessage: message }, '*');
}

export function onPluginMessage(handler: (msg: PluginResponse) => void) {
  const listener = (event: MessageEvent) => {
    const data = (event.data || {}) as { pluginMessage?: unknown };
    const msg = data.pluginMessage as PluginResponse | undefined;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
    handler(msg);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

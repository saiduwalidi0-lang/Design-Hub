import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudUpload, Loader2, RefreshCw, Search } from 'lucide-react';
import { onPluginMessage, postToPlugin, type CrawledAssetMeta } from '@/figma/bridge';
import { useCmsSettings } from '@/stores/cmsSettings';
import { buildCrawlImportPayload, type CrawledAsset } from '@/tools/crawlToCms/buildCrawlImportPayload';

type CrawlState =
  | { status: 'idle' }
  | { status: 'crawling'; done: number; total: number; pages: number }
  | { status: 'uploading'; done: number; total: number }
  | { status: 'success'; imported: number }
  | { status: 'error'; message: string };

export function CrawlToCmsPage() {
  const { baseUrl, token, setBaseUrl, setToken } = useCmsSettings();
  const [scale, setScale] = useState<number>(2);
  const [fileKey, setFileKey] = useState<string | undefined>(undefined);
  const [assets, setAssets] = useState<CrawledAsset[]>([]);
  const [state, setState] = useState<CrawlState>({ status: 'idle' });

  const assetsRef = useRef<CrawledAsset[]>([]);
  const baseUrlRef = useRef(baseUrl);
  const tokenRef = useRef(token);
  const pendingUploadRef = useRef(false);

  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { baseUrlRef.current = baseUrl; }, [baseUrl]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const summary = useMemo(() => {
    const titles = new Set(assets.map(a => a.title));
    return { assets: assets.length, campaigns: titles.size };
  }, [assets]);

  const uploadToCms = useCallback(async () => {
    try {
      const baseUrlNow = baseUrlRef.current;
      const tokenNow = tokenRef.current;
      const payload = buildCrawlImportPayload({ assets: assetsRef.current });
      if (payload.items.length === 0 || payload.files.length === 0) {
        setState({ status: 'error', message: '没有可上传的资源' });
        return;
      }

      setState({ status: 'uploading', done: 0, total: payload.files.length });

      const formData = new FormData();
      formData.append('items', JSON.stringify(payload.items));
      payload.files
        .slice()
        .sort((a, b) => a.fileIndex - b.fileIndex)
        .forEach((f, i) => {
          const blob = new Blob([f.bytes], { type: 'image/png' });
          formData.append('file', blob, f.name || `asset-${i}.png`);
          setState(prev => (prev.status === 'uploading' ? { ...prev, done: i + 1 } : prev));
        });

      const headers: Record<string, string> = {};
      const t = tokenNow.trim();
      if (t) headers['Authorization'] = `Bearer ${t}`;

      const res = await fetch(`${baseUrlNow.replace(/\/$/, '')}/api/figma-import`, {
        method: 'POST',
        body: formData,
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: 'error', message: data?.error || `导入失败（HTTP ${res.status}）` });
        return;
      }
      setState({ status: 'success', imported: Number(data?.imported || 0) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    postToPlugin({ type: 'PING' });
    return onPluginMessage((msg) => {
      if (msg.type === 'PONG') {
        setFileKey(msg.fileKey);
        return;
      }

      if (msg.type === 'CRAWL_START') {
        setAssets([]);
        setState({ status: 'crawling', done: 0, total: msg.totalAssets, pages: msg.totalPages });
        return;
      }

      if (msg.type === 'CRAWL_ASSET') {
        const a = msg.asset as CrawledAssetMeta;
        const item: CrawledAsset = { ...a, bytes: msg.bytes };
        setAssets(prev => [...prev, item]);
        setState(prev => {
          if (prev.status !== 'crawling') return prev;
          return { status: 'crawling', done: prev.done + 1, total: prev.total, pages: prev.pages };
        });
        return;
      }

      if (msg.type === 'CRAWL_DONE') {
        if (pendingUploadRef.current) {
          pendingUploadRef.current = false;
          queueMicrotask(() => { void uploadToCms(); });
        } else {
          setState({ status: 'idle' });
        }
        return;
      }

      if (msg.type === 'CRAWL_ERROR') {
        pendingUploadRef.current = false;
        setState({ status: 'error', message: msg.message });
      }
    });
  }, [uploadToCms]);

  const canRun = state.status === 'idle' || state.status === 'success' || state.status === 'error';
  const startCrawlOnly = () => {
    pendingUploadRef.current = false;
    postToPlugin({ type: 'CRAWL_FILE', mode: 'currentFile', scale });
  };
  const startCrawlAndSync = () => {
    pendingUploadRef.current = true;
    postToPlugin({ type: 'CRAWL_FILE', mode: 'currentFile', scale });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">Figma 爬取 → 同步到 CMS</div>
          <div className="text-[11px] text-gray-500 truncate">{fileKey ? `Figma file: ${fileKey}` : '未获取到 fileKey（本地预览可忽略）'}</div>
        </div>
        <button
          type="button"
          onClick={() => postToPlugin({ type: 'PING' })}
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
        >
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-900">CMS 连接</div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[11px] text-gray-600 mb-1">Base URL</div>
              <input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="http://localhost:3001"
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-600 mb-1">Token（可选）</div>
              <input
                value={token}
                onChange={e => setToken(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Bearer token"
                type="password"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-900">爬取设置</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-700">
              倍图
              <select
                className="mt-1 w-full h-9 px-2 rounded-lg border border-gray-200"
                value={String(scale)}
                onChange={e => setScale(Number(e.target.value))}
              >
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="3">3x</option>
                <option value="4">4x</option>
              </select>
            </label>
            <div className="text-[11px] text-gray-700">
              范围
              <div className="mt-1 h-9 px-2 rounded-lg border border-gray-200 flex items-center text-gray-600">当前文件</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!canRun}
              onClick={startCrawlOnly}
              className="flex-1 h-9 rounded-lg bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              {(state.status === 'crawling' || state.status === 'uploading') ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              仅爬取
            </button>
            <button
              type="button"
              disabled={!canRun}
              onClick={startCrawlAndSync}
              className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              {(state.status === 'crawling' || state.status === 'uploading') ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
              爬取并同步
            </button>
          </div>

          <div className="mt-2 text-[11px] text-gray-500">缓存：{summary.campaigns} 个活动 / {summary.assets} 个素材</div>
        </div>

        {state.status === 'crawling' && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-900">爬取中</div>
            <div className="text-[11px] text-gray-600 mt-1">{state.done}/{state.total}（{state.pages} 页）</div>
          </div>
        )}

        {state.status === 'uploading' && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-900">上传中</div>
            <div className="text-[11px] text-gray-600 mt-1">{state.done}/{state.total}</div>
          </div>
        )}

        {state.status === 'success' && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-3">
            <div className="text-xs font-semibold text-green-900">同步完成</div>
            <div className="text-[11px] text-green-700 mt-1">已导入 {state.imported} 条记录（默认未发布）</div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="text-xs font-semibold text-red-900">失败</div>
            <div className="text-[11px] text-red-700 mt-1 break-words">{state.message}</div>
          </div>
        )}
      </div>
    </div>
  );
}


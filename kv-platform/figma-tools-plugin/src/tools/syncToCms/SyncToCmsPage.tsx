import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CloudUpload, Loader2, RefreshCw } from 'lucide-react';
import { onPluginMessage, postToPlugin, type ExportMode, type ExportedNodeMeta } from '@/figma/bridge';
import { useCmsSettings } from '@/stores/cmsSettings';
import { buildImportPayload, type ExportedItem } from '@/tools/syncToCms/buildImportPayload';

type ExportState =
  | { status: 'idle' }
  | { status: 'exporting'; done: number; total: number }
  | { status: 'uploading'; done: number; total: number }
  | { status: 'success'; imported: number }
  | { status: 'error'; message: string };

export function SyncToCmsPage() {
  const { baseUrl, token, setBaseUrl, setToken } = useCmsSettings();
  const [mode, setMode] = useState<ExportMode>('selection');
  const [scale, setScale] = useState<number>(2);
  const [fileKey, setFileKey] = useState<string | undefined>(undefined);
  const [exported, setExported] = useState<ExportedItem[]>([]);
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const pendingSyncRef = useRef(false);
  const exportedRef = useRef<ExportedItem[]>([]);
  const baseUrlRef = useRef(baseUrl);
  const tokenRef = useRef(token);
  const fileKeyRef = useRef<string | undefined>(fileKey);

  const summary = useMemo(() => {
    const pages = new Set(exported.map(e => e.pageName));
    return { count: exported.length, pages: pages.size };
  }, [exported]);

  useEffect(() => {
    exportedRef.current = exported;
  }, [exported]);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    fileKeyRef.current = fileKey;
  }, [fileKey]);

  const uploadToCms = useCallback(async () => {
    try {
      const exportedNow = exportedRef.current;
      const baseUrlNow = baseUrlRef.current;
      const tokenNow = tokenRef.current;
      const fileKeyNow = fileKeyRef.current;

      const payload = buildImportPayload({ exported: exportedNow, fileKey: fileKeyNow });
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
      if (msg.type === 'EXPORT_START') {
        setExported([]);
        setState({ status: 'exporting', done: 0, total: msg.total });
        return;
      }
      if (msg.type === 'EXPORT_ITEM') {
        const item: ExportedItem = { ...msg.node, bytes: msg.bytes };
        setExported(prev => {
          const next = [...prev, item];
          return next;
        });
        setState(prev => {
          if (prev.status !== 'exporting') return prev;
          return { status: 'exporting', done: prev.done + 1, total: prev.total };
        });
        return;
      }
      if (msg.type === 'EXPORT_DONE') {
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false;
          queueMicrotask(() => {
            void uploadToCms();
          });
        } else {
          setState({ status: 'idle' });
        }
        return;
      }
      if (msg.type === 'EXPORT_ERROR') {
        pendingSyncRef.current = false;
        setState({ status: 'error', message: msg.message });
      }
    });
  }, [uploadToCms]);

  const canRun = state.status === 'idle' || state.status === 'success' || state.status === 'error';

  const startExportAndSync = () => {
    pendingSyncRef.current = true;
    postToPlugin({ type: 'EXPORT_NODES', mode, scale });
  };

  const formatExportMeta = (m: ExportedNodeMeta) => {
    const dims = `${Math.round(m.width)}×${Math.round(m.height)}`;
    return `${m.pageName} / ${m.name} (${dims})`;
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <a href="#/" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700">
          <ArrowLeft size={16} />
        </a>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">同步到 CMS</div>
          <div className="text-[11px] text-gray-500 truncate">{fileKey ? `Figma file: ${fileKey}` : '未获取到 fileKey（本地预览可忽略）'}</div>
        </div>
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
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-900">导出设置</div>
            <button
              type="button"
              onClick={() => postToPlugin({ type: 'PING' })}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
            >
              <RefreshCw size={12} /> 刷新
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-700">
              范围
              <select
                className="mt-1 w-full h-9 px-2 rounded-lg border border-gray-200"
                value={mode}
                onChange={e => setMode(e.target.value as ExportMode)}
              >
                <option value="selection">选中节点</option>
                <option value="page">当前页顶层</option>
              </select>
            </label>
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
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!canRun}
              onClick={startExportAndSync}
              className="flex-1 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              {(state.status === 'exporting' || state.status === 'uploading') ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
              导出并同步
            </button>
          </div>

          <div className="mt-2 text-[11px] text-gray-500">已缓存：{summary.count} 张（{summary.pages} 个页面）</div>
        </div>

        {state.status === 'exporting' && (
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-semibold text-gray-900">导出中</div>
            <div className="text-[11px] text-gray-600 mt-1">{state.done}/{state.total}</div>
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

        {exported.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-900">导出清单</div>
            <div className="max-h-56 overflow-y-auto">
              {exported.slice(0, 50).map((e, idx) => (
                <div key={`${e.id}-${idx}`} className="px-3 py-2 border-b border-gray-100 text-[11px] text-gray-700">
                  {formatExportMeta(e)}
                </div>
              ))}
              {exported.length > 50 && (
                <div className="px-3 py-2 text-[11px] text-gray-500">仅展示前 50 条</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

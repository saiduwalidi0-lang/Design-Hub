import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Globe, Key,
  Settings2, Zap, Download, Fingerprint,
} from 'lucide-react';
import { ImageUploadGroup, type ImageItem } from '../components/ImageUploadGroup';
import { cmsApiUrl, readCMSJson } from '../cmsApi';

interface CrawlEvent {
  type: 'progress' | 'done' | 'error';
  step?: string;
  sessionId?: string;
  message?: string;
  imported?: number;
  downloaded?: number;
  skippedDuplicates?: number;
  items?: { id?: string; title: string }[];
  preview?: boolean;
  partial?: boolean;
  localPath?: string;
  filesProcessed?: number;
  previewItems?: PreviewItem[];
}

interface TagOptions {
  [key: string]: string[];
}

interface PreviewItem {
  title: string;
  date: string;
  designer?: string;
  region: string;
  level: string;
  figmaUrl?: string;
  categories?: Record<string, string>;
  tagMeta?: { source?: string; error?: string; raw?: string; model?: string; usedImage?: boolean };
  isIP?: boolean;
  imageUrl?: string;
  images: {
    kv?: ImageItem[];
    h5?: ImageItem[];
    banner1029x276?: ImageItem[];
    banner750x500?: ImageItem[];
    avatarFrame?: (ImageItem & { type: string; level: string })[];
    icons?: ImageItem[];
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  theme: '主题 Theme',
  style: '风格 Style',
  colorTone: '色调 ColorTone',
  vibe: '氛围 Vibe',
  element: '元素 Element',
  size: '尺寸 Size',
  collaboration: '联名 Collaboration',
};

function TagEnumPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const all = [''].concat(options || []);
  return (
    <div>
      <div className="block text-[11px] font-medium text-gray-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        {all.map(opt => {
          const isSelected = (value || '') === (opt || '');
          const text = opt ? opt : '不设置';
          return (
            <button
              key={opt || '__empty__'}
              type="button"
              onClick={() => onChange(opt)}
              className={
                `px-2.5 py-1 rounded-full text-xs border transition-colors ` +
                (isSelected
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300')
              }
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FigmaCrawlPage = () => {
  const [figmaUrl, setFigmaUrl] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('figma_token') || '');
  const [saveToken, setSaveToken] = useState(true);
  const [scale, setScale] = useState(2);
  const [autoImport] = useState(false);
  const [enableDedup, setEnableDedup] = useState(true);
  const [localSavePath, setLocalSavePath] = useState(() => localStorage.getItem('crawl_save_path') || '');
  const [tagOptions, setTagOptions] = useState<TagOptions>({});

  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [logs, setLogs] = useState<CrawlEvent[]>([]);
  const [result, setResult] = useState<CrawlEvent | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetch(cmsApiUrl('/api/tag-options'))
      .then(r => r.json()).then(setTagOptions).catch(() => {});
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const updatePreviewItemCategory = useCallback((index: number, key: string, value: string) => {
    setPreviewItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return { ...item, categories: { ...(item.categories || {}), [key]: value } };
    }));
  }, []);

  const updatePreviewItemIsIP = useCallback((index: number, value: boolean) => {
    setPreviewItems(prev => prev.map((item, i) => i === index ? { ...item, isIP: value } : item));
  }, []);

  const startCrawl = async () => {
    if (!figmaUrl || !token) return;
    if (saveToken) localStorage.setItem('figma_token', token);
    if (localSavePath) localStorage.setItem('crawl_save_path', localSavePath);

    setRunning(true);
    setLogs([]);
    setResult(null);
    setPreviewItems([]);
    sessionIdRef.current = null;

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const resp = await fetch(cmsApiUrl('/api/figma-crawl'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          figmaUrl, token, scale, autoImport, enableDedup,
          crawlTypes: ['kv', 'avatarFrame', 'banner1029x276', 'banner750x500', 'h5'],
          localSavePath: localSavePath || undefined,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        const tr = t.trim();
        if (tr.startsWith('<!DOCTYPE') || tr.startsWith('<html') || tr.startsWith('<!doctype')) {
          throw new Error(
            '接口返回了网页而不是数据。请先在本机启动 CMS：进入 kv-platform/cms 执行 node index.js（默认端口 3001），再重试爬取。'
          );
        }
        let msg = `爬取请求失败（HTTP ${resp.status}）`;
        try {
          const j = JSON.parse(t) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          if (tr) msg = tr.slice(0, 200);
        }
        throw new Error(msg);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith(':')) continue; // SSE 注释（keepalive）
          if (!line.startsWith('data: ')) continue;
          try {
            const event: CrawlEvent = JSON.parse(line.slice(6));
            if (event.sessionId) sessionIdRef.current = event.sessionId;
            if (event.type === 'done' || event.type === 'error') {
              setResult(event);
              if (event.type === 'done' && event.previewItems) {
                setPreviewItems(event.previewItems);
              }
            }
            setLogs(prev => [...prev, event]);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setLogs(prev => [...prev, { type: 'progress', step: 'fetch', message: '⏹️ 已手动停止本次爬取' }]);
        setResult({ type: 'error', message: '已停止爬取' });
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setResult({ type: 'error', message: msg });
        setLogs(prev => [...prev, { type: 'error', message: msg }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stopCrawl = () => {
    const sid = sessionIdRef.current;
    if (sid) {
      // 显式通知后端停止，不断开连接以接收已下载的素材
      fetch(cmsApiUrl('/api/figma-cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {});
      setLogs(prev => [...prev, { type: 'progress', step: 'fetch', message: '⏹️ 已请求停止，等待已下载素材...' }]);
    } else {
      abortRef.current?.abort();
    }
  };

  const updatePreviewItem = (index: number, field: keyof PreviewItem, value: string) => {
    setPreviewItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleImageUpload = async (itemIndex: number, category: keyof PreviewItem['images'], files: File[]) => {
    const newItems = [...previewItems];
    const targetItem = newItems[itemIndex];
    if (!targetItem.images[category]) targetItem.images[category] = [];

    const newImages = files.map(file => ({
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: URL.createObjectURL(file),
      file, // Keep file reference for upload
      type: 'Creator', // Default for avatarFrame
      level: 'LV1'    // Default for avatarFrame
    }));

    (targetItem.images[category] as typeof newImages).push(...newImages);
    setPreviewItems(newItems);
  };

  const handleImageRemove = (itemIndex: number, category: keyof PreviewItem['images'], id: string) => {
    setPreviewItems(prev => {
      const newItems = [...prev];
      const targetItem = newItems[itemIndex];
      if (targetItem.images[category]) {
        // @ts-expect-error dynamic filter
        targetItem.images[category] = targetItem.images[category].filter((img: ImageItem) => img.id !== id);
      }
      return newItems;
    });
  };

  const handleConfirmImport = async () => {
    if (!previewItems.length) return;
    setImporting(true);
    try {
      // Need to handle mixed content (URLs and Files)
      // This is a complex scenario: 
      // 1. Existing crawled images are just URLs/paths on server
      // 2. New local files need to be uploaded
      // Simplified strategy: Upload local files first to a temp endpoint or include in form data?
      // Since existing API expects JSON body with items, we might need to adjust API or upload images first.
      
      // For now, let's assume the backend can handle base64 or we upload individually.
      // But standard way is FormData with JSON + Files.
      
      const formData = new FormData();

      let fileIndex = 0;
      const cleanItems = previewItems.map(item => {
        const newItem = { ...item, images: { ...item.images } };
        
        Object.keys(newItem.images).forEach(cat => {
          const key = cat as keyof typeof newItem.images;
          if (newItem.images[key]) {
            // @ts-expect-error map
            newItem.images[key] = newItem.images[key].map((img: ImageItem) => {
              if (img.file) {
                formData.append('files', img.file);
                // We need to tell backend which file corresponds to this image.
                // We can use a special URL scheme or ID.
                return { ...img, url: `file:${fileIndex++}`, file: undefined };
              }
              return img;
            });
          }
        });
        return newItem;
      });

      formData.append('items', JSON.stringify(cleanItems));

      const resp = await fetch(cmsApiUrl('/api/figma-import'), {
        method: 'POST',
        // headers: { 'Content-Type': 'multipart/form-data' }, // Browser sets this automatically with boundary
        body: formData,
      });
      
      const data = await readCMSJson<{
        error?: string;
        imported?: number;
        items?: { id?: string; title: string }[];
      }>(resp);
      if (!resp.ok) throw new Error(data?.error || 'Import failed');
      
      setResult(prev => ({
        ...(prev || { type: 'done' as const }),
        type: 'done',
        imported: data.imported,
        items: data.items,
      }));
      setPreviewItems([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setLogs(prev => [...prev, { type: 'error', message: msg }]);
      setResult({ type: 'error', message: msg });
    } finally {
      setImporting(false);
    }
  };

  const stepIcons: Record<string, string> = {
    fetch: '📂', analyze: '🔍', export: '🖼️', download: '⬇️', tag: '🏷️', import: '📥',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Figma 爬取工具</h1>
          <p className="text-sm text-gray-500 mt-1">
            区块发现 + 空间分析 + dHash 去重 → 自动打标 → 导入 CMS
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Figma URL + Token */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Globe size={16} className="text-blue-500" /> Figma 连接
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Figma 链接</label>
              <input
                type="text" value={figmaUrl} onChange={e => setFigmaUrl(e.target.value)}
                placeholder="文件链接、项目链接、或文件 Key 均可"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                disabled={running}
              />
              <p className="text-xs text-gray-400 mt-1">
                支持: <code className="bg-gray-100 px-1 rounded">figma.com/file/xxx</code>（单文件）、
                <code className="bg-gray-100 px-1 rounded">figma.com/files/project/123</code>（整个项目，自动爬所有文件）
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center gap-2">
                <Key size={14} /> Personal Access Token
              </label>
              <div className="flex gap-3">
                <input
                  type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder="figd_..."
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-mono"
                  disabled={running}
                />
                <label className="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap cursor-pointer select-none">
                  <input type="checkbox" checked={saveToken} onChange={e => setSaveToken(e.target.checked)} className="rounded" />
                  记住 Token
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-1">Figma → Settings → Personal Access Tokens</p>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Settings2 size={16} className="text-gray-500" /> 爬取选项
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">本地保存路径</label>
              <input
                type="text" value={localSavePath}
                onChange={e => setLocalSavePath(e.target.value)}
                placeholder="留空则默认保存到 kv-platform/Assets_Library/"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-mono"
                disabled={running}
              />
              <p className="text-xs text-gray-400 mt-1">
                图片会按 <code className="bg-gray-100 px-1 rounded">活动名/KV/</code>
                <code className="bg-gray-100 px-1 rounded">活动名/Banner_1029x276/</code>
                <code className="bg-gray-100 px-1 rounded">活动名/AvatarFrame/</code> 等子文件夹组织
              </p>
            </div>
            <div className="flex flex-wrap gap-6 items-center">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">导出倍率</label>
                <select value={scale} onChange={e => setScale(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" disabled={running}>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                  <option value={4}>4x</option>
                </select>
              </div>
              <span className="text-sm text-gray-500">爬取后先预览编辑，再确认入库</span>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <Fingerprint size={14} className="text-amber-500" />
                <input type="checkbox" checked={enableDedup} onChange={e => setEnableDedup(e.target.checked)} className="rounded" disabled={running} />
                dHash 去重
              </label>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={startCrawl}
          disabled={running || !figmaUrl || !token}
          className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2
            disabled:opacity-50 disabled:cursor-not-allowed
            bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl"
        >
          {running ? (
            <><Loader2 size={18} className="animate-spin" /> 爬取中...</>
          ) : (
            <><Zap size={18} /> 开始爬取</>
          )}
        </button>
        {running && (
          <button
            onClick={stopCrawl}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all text-white bg-red-500 hover:bg-red-600"
          >
            ⏹️ 停止爬取
          </button>
        )}
      </div>

      {/* Progress Logs */}
      {logs.length > 0 && (
        <div className="mt-8 bg-gray-900 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${running ? 'bg-green-400 animate-pulse' : result?.type === 'error' ? 'bg-red-400' : 'bg-blue-400'}`} />
            <span className="text-xs font-medium text-gray-400">
              {running ? '运行中...' : result?.type === 'error' ? '出错了' : '已完成'}
            </span>
          </div>
          <div className="p-4 max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className={`flex items-start gap-2 ${
                log.type === 'error' ? 'text-red-400' : log.type === 'done' ? 'text-green-400' : 'text-gray-300'
              }`}>
                <span className="shrink-0">
                  {log.type === 'error' ? '❌' : log.type === 'done' ? '✅' : stepIcons[log.step || ''] || '▸'}
                </span>
                <span className="whitespace-pre-wrap">
                  {log.message || (log.type === 'done'
                    ? `完成！下载 ${log.downloaded} 张图片${log.skippedDuplicates ? `，去重跳过 ${log.skippedDuplicates} 张` : ''}${log.imported ? `，导入 ${log.imported} 个项目` : ''}`
                    : '')}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Result */}
      {previewItems.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-blue-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-3">
            预览并修改（确认后入库）
            {result?.partial && (
              <span className="ml-2 text-amber-600 text-sm font-normal">断点续传：已停止，保留已下载素材</span>
            )}
          </h3>
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
            {previewItems.map((item, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">活动标题</label>
                    <input value={item.title || ''} onChange={e => updatePreviewItem(i, 'title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="活动名" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">日期</label>
                    <input value={item.date || ''} onChange={e => updatePreviewItem(i, 'date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">设计师</label>
                    <input value={item.designer || ''} onChange={e => updatePreviewItem(i, 'designer', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="Designer" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">地区</label>
                    <input value={item.region || ''} onChange={e => updatePreviewItem(i, 'region', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm" placeholder="Region" />
                  </div>
                </div>

                <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="text-xs font-medium text-gray-700 mb-3">标签（自动打标，可修改）</div>
                  <div className="text-[11px] text-gray-500 mb-3">
                    来源: {item.tagMeta?.source || 'unknown'}
                    {item.tagMeta?.model ? ` ｜ 模型: ${item.tagMeta.model}` : ''}
                    {typeof item.tagMeta?.usedImage === 'boolean' ? ` ｜ 图片: ${item.tagMeta.usedImage ? '是' : '否'}` : ''}
                    {item.tagMeta?.error ? ` ｜ 错误: ${item.tagMeta.error}` : ''}
                  </div>
                  {(item.tagMeta?.raw || item.tagMeta?.error) && (
                    <details className="mb-3">
                      <summary className="text-[11px] text-blue-600 cursor-pointer select-none">查看打标详情</summary>
                      <pre className="mt-2 text-[11px] bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                        {item.tagMeta?.raw || '(no raw response)'}
                      </pre>
                    </details>
                  )}
                  <div className="mb-4 flex items-center justify-between">
                    <label className="text-[11px] font-medium text-gray-600 flex items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={!!item.isIP}
                        onChange={e => updatePreviewItemIsIP(i, e.target.checked)}
                      />
                      IP活动（手动）
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <TagEnumPicker
                        key={key}
                        label={label}
                        value={(item.categories || {})[key] || ''}
                        options={tagOptions[key] || []}
                        onChange={v => updatePreviewItemCategory(i, key, v)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <ImageUploadGroup
                    label="KV 主图"
                    required={true}
                    items={item.images.kv || []}
                    onUpload={files => handleImageUpload(i, 'kv', files)}
                    onRemove={id => handleImageRemove(i, 'kv', id)}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <ImageUploadGroup
                      label="Banner (1029x276)"
                      required={false}
                      items={item.images.banner1029x276 || []}
                      onUpload={files => handleImageUpload(i, 'banner1029x276', files)}
                      onRemove={id => handleImageRemove(i, 'banner1029x276', id)}
                    />
                    <ImageUploadGroup
                      label="Banner (750x500)"
                      required={false}
                      items={item.images.banner750x500 || []}
                      onUpload={files => handleImageUpload(i, 'banner750x500', files)}
                      onRemove={id => handleImageRemove(i, 'banner750x500', id)}
                    />
                  </div>

                  <ImageUploadGroup
                    label="头像框 Avatar Frames"
                    required={false}
                    items={item.images.avatarFrame || []}
                    onUpload={files => handleImageUpload(i, 'avatarFrame', files)}
                    onRemove={id => handleImageRemove(i, 'avatarFrame', id)}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <ImageUploadGroup
                      label="H5"
                      required={false}
                      items={item.images.h5 || []}
                      onUpload={files => handleImageUpload(i, 'h5', files)}
                      onRemove={id => handleImageRemove(i, 'h5', id)}
                    />
                    <ImageUploadGroup
                      label="Icons"
                      required={false}
                      items={item.images.icons || []}
                      onUpload={files => handleImageUpload(i, 'icons', files)}
                      onRemove={id => handleImageRemove(i, 'icons', id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? '入库中...' : '确认入库'}
            </button>
            <button
              onClick={() => setPreviewItems([])}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              清空预览
            </button>
          </div>
        </div>
      )}

      {result && result.type === 'done' && (
        <div className="mt-6 bg-white rounded-xl border border-green-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="text-green-500" size={24} />
            <div>
              <h3 className="font-semibold text-gray-900">爬取完成</h3>
              <p className="text-sm text-gray-500">
                下载 {result.downloaded} 张新图片
                {(result.skippedDuplicates ?? 0) > 0 && (
                  <span className="text-amber-600">，去重跳过 {result.skippedDuplicates} 张</span>
                )}
                {result.imported ? `，已导入 ${result.imported} 个 KV` : ''}
              </p>
            </div>
          </div>
          <div className={`grid gap-3 mb-4 ${(result.filesProcessed || 0) > 1 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {(result.filesProcessed || 0) > 1 && (
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{result.filesProcessed}</p>
                <p className="text-xs text-purple-500">文件</p>
              </div>
            )}
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{result.downloaded}</p>
              <p className="text-xs text-blue-500">新下载</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.skippedDuplicates || 0}</p>
              <p className="text-xs text-amber-500">去重跳过</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.imported || 0}</p>
              <p className="text-xs text-green-500">已导入 CMS</p>
            </div>
          </div>
          {result.localPath && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-1">本地保存位置</p>
              <p className="text-sm font-mono text-gray-700 break-all">{result.localPath}</p>
            </div>
          )}
          {result.items && result.items.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase">导入的项目</h4>
              <div className="space-y-2">
                {result.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">{item.title}</span>
                    {item.id && (
                      <Link to={`/edit/${item.id}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        查看编辑 →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <Link to="/" className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              返回 KV 列表
            </Link>
            <button
              onClick={() => { setLogs([]); setResult(null); setFigmaUrl(''); }}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              继续爬取
            </button>
          </div>
        </div>
      )}

      {result && result.type === 'error' && (
        <div className="mt-6 bg-white rounded-xl border border-red-200 shadow-sm p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-500" size={24} />
            <div>
              <h3 className="font-semibold text-gray-900">
                {previewItems.length > 0 ? '入库失败' : '爬取失败'}
              </h3>
              <p className="text-sm text-red-600 mt-1">{result.message}</p>
              {(result.message?.includes('已停止') || result.message?.includes('cancelled')) && (
                <p className="text-xs text-gray-500 mt-2">
                  若未手动点击停止，可能是网络/代理断开。可尝试关闭 VPN 或检查连接后重试。
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => { setLogs([]); setResult(null); }}
            className="mt-4 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* Help — How it works */}
      <div className="mt-8 bg-blue-50 rounded-xl border border-blue-100 p-6 mb-8">
        <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <Download size={16} /> 工作原理
        </h3>
        <div className="text-sm text-blue-700 space-y-3">
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700">1</span>
            <div>
              <p className="font-medium">区块发现</p>
              <p className="text-xs text-blue-600">
                递归扫描 Figma 节点树，通过节点名匹配识别区块:
                <code className="bg-blue-100 px-1 rounded mx-1">KV Background</code>
                <code className="bg-blue-100 px-1 rounded mx-1">Banner</code>
                <code className="bg-blue-100 px-1 rounded mx-1">Avatar Frame</code>
                <code className="bg-blue-100 px-1 rounded mx-1">H5</code>
                等，自动跳过 Characters / Video frames
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700">2</span>
            <div>
              <p className="font-medium">区块内素材提取</p>
              <p className="text-xs text-blue-600">
                在每个区块内递归收集叶子 Frame 作为导出目标；Banner 根据实际宽高比自动分为 1029×276 / 750×500
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700">3</span>
            <div>
              <p className="font-medium">空间位置分析（头像框）</p>
              <p className="text-xs text-blue-600">
                读取 Avatar Frame 区块内的文字节点（主播/观众、S/M/L），通过坐标距离计算判定每个头像框的
                <code className="bg-blue-100 px-1 rounded mx-1">Creator / Viewer</code> 身份和
                <code className="bg-blue-100 px-1 rounded mx-1">LV1 / LV2 / LV3&4</code> 等级
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700">4</span>
            <div>
              <p className="font-medium">dHash 去重 + 导入</p>
              <p className="text-xs text-blue-600">对每张图计算感知哈希指纹，跳过重复素材，最终导入 CMS（默认下线状态）</p>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-100/50 rounded-lg">
          <p className="text-xs text-blue-700 font-medium mb-2">Figma 文件结构要求</p>
          <p className="text-xs text-blue-600">
            确保素材区块的 Group/Frame 名称包含以下关键词（不区分大小写）:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['KV Background', 'H5', 'Banner', 'Avatar Frame / 头像框', 'Icon', 'Customized Page'].map(k => (
              <code key={k} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{k}</code>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            头像框区块内需要「主播」/「观众」文字标注和 S/M/L 或 LV 等级标注
          </p>
        </div>
      </div>
    </div>
  );
};

export default FigmaCrawlPage;

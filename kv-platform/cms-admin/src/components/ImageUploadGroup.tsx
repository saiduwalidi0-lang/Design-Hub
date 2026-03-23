import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Upload, X } from 'lucide-react';

export interface ImageItem {
  id: string;
  url: string;
  isDuplicate?: boolean; // Added for FigmaCrawlPage
  badgeText?: string;
  file?: File;           // Added for local uploads
}

/* ─── Reusable image upload group (file + paste) ─── */

export function ImageUploadGroup({ label, hint, required, items, onUpload, onRemove }: {
  label: string;
  hint?: string;
  required: boolean;
  items: ImageItem[];
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ratios, setRatios] = useState<Record<string, number>>({});

  const handleFiles = async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setUploading(true);
    try { await onUpload(imageFiles); } finally { setUploading(false); }
  };

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!dropRef.current?.contains(document.activeElement) && document.activeElement !== dropRef.current) return;
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length > 0) { e.preventDefault(); await handleFiles(files); }
  }, [onUpload]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {hint && <span className="ml-2 text-xs text-gray-400">{hint}</span>}
          {!required && <span className="ml-2 text-xs text-gray-400">选填 Optional</span>}
        </div>
        <FileUploadButton onUpload={async (files) => { setUploading(true); try { await onUpload(files); } finally { setUploading(false); } }} />
      </div>

      {/* Drop zone + paste area */}
      <div
        ref={dropRef}
        tabIndex={0}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={async e => { e.preventDefault(); setDragging(false); await handleFiles(Array.from(e.dataTransfer.files)); }}
        className={`rounded-lg border-2 border-dashed transition-colors p-3 outline-none focus:border-blue-400 ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        {uploading && (
          <div className="flex items-center justify-center py-3 gap-2 text-sm text-blue-600">
            <Loader2 size={16} className="animate-spin" /> 上传中...
          </div>
        )}

        {!uploading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-gray-400">
            <Upload size={20} className="mb-1.5" />
            <p className="text-xs">拖拽图片到此处、点击右上角选择文件</p>
            <p className="text-xs">或点击此区域后 <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono mx-0.5">Ctrl+V</kbd> 粘贴剪贴板</p>
          </div>
        )}

        {!uploading && items.length > 0 && (
          <div className="flex items-start gap-3 overflow-x-auto pb-1">
            {items.map(img => (
              <div key={img.id} className="relative flex-shrink-0 w-28 group">
                <div
                  className={`w-28 rounded-md overflow-hidden border bg-gray-50 ${(img.badgeText || img.isDuplicate) ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200'}`}
                  style={{ aspectRatio: String(ratios[img.id] || 4 / 3) }}
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-contain bg-gray-50"
                    onLoad={e => {
                      const el = e.currentTarget;
                      const w = el.naturalWidth;
                      const h = el.naturalHeight;
                      if (w > 0 && h > 0) {
                        const r = w / h;
                        setRatios(prev => (prev[img.id] === r ? prev : { ...prev, [img.id]: r }));
                      }
                    }}
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                  {(img.badgeText || img.isDuplicate) && (
                    <div className="absolute top-0 left-0 bg-amber-500 text-white text-[10px] px-1 py-0.5 rounded-br opacity-90">{img.badgeText || '重复'}</div>
                  )}
                </div>
                <button type="button" onClick={() => onRemove(img.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10">
                  <X size={12} />
                </button>
                <p className="text-[10px] text-gray-400 truncate mt-1" title={img.url}>{img.url.split('/').pop()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── File upload button (opens file picker) ─── */

export function FileUploadButton({ onUpload }: { onUpload: (files: File[]) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBusy(true);
    try { await onUpload(files); } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChange} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors disabled:text-blue-400">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {busy ? '上传中...' : '选择文件'}
      </button>
    </>
  );
}

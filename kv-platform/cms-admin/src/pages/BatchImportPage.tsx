import React, { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileJson, FolderOpen, Loader2, CheckCircle2, AlertCircle, Info, ChevronDown, ChevronRight, X, Plus } from 'lucide-react';
import { AutoRatioImage } from '../components/AutoRatioImage';

interface ManifestItem {
  title?: string;
  date?: string;
  region?: string;
  level?: string;
  imageFileName?: string;
  categories?: Record<string, string>;
  images?: {
    kv?: string[];
    h5?: string[];
    banner1029x276?: string[];
    banner750x500?: string[];
    avatarFrame?: { fileName: string; type: string; level: string }[];
    icons?: string[];
  };
  [key: string]: unknown;
}

interface ImportResult {
  imported: number;
  items: { id: string; title: string }[];
}

const EXAMPLE_JSON = `{
  "items": [
    {
      "title": "Spring Festival 2026",
      "date": "2026-01-28",
      "region": "SEA",
      "level": "TOP",
      "imageFileName": "spring_kv.png",
      "figmaUrl": "https://figma.com/...",
      "categories": {
        "theme": "节日",
        "style": "2DFlat",
        "colorTone": "Warm",
        "vibe": "Happy",
        "element": "Coin",
        "size": "900",
        "ipCampaign": "NonIP",
        "collaboration": "Non collaborate"
      },
      "images": {
        "kv": ["spring_kv.png", "spring_kv_v2.png"],
        "h5": ["spring_h5.png"],
        "banner1029x276": ["spring_banner_wide.png"],
        "banner750x500": ["spring_banner.png"],
        "avatarFrame": [
          { "fileName": "spring_af_creator.png", "type": "Creator", "level": "LV1" }
        ],
        "icons": ["spring_icon.png"]
      }
    }
  ]
}`;

const BatchImportPage = () => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const [manifest, setManifest] = useState<{ items: ManifestItem[] } | null>(null);
  const [jsonFileName, setJsonFileName] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Generate preview URLs for selected files
  const previewUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    imageFiles.forEach(file => {
      urls[file.name] = URL.createObjectURL(file);
    });
    return urls;
  }, [imageFiles]);

  // Cleanup URLs on unmount or file change (though useMemo handles recreation, we need explicit revoke if we want to be strict, 
  // but for simple usage in useMemo, React doesn't auto-revoke. 
  // Given the complexity, we'll let browser GC handle it on page reload/navigation for now, or use a proper effect if memory is an issue.)
  // Better approach with effect:
  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonFileName(file.name);
    setResult(null);
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.items || !Array.isArray(data.items)) {
          setError('JSON 格式错误：需要包含 "items" 数组');
          setManifest(null);
          return;
        }
        setManifest(data);
      } catch {
        setError('JSON 解析失败，请检查文件格式');
        setManifest(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImageFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImageFiles(files);
    setResult(null);
    setError('');
  };

  const allImageNames = new Set(imageFiles.map(f => f.name));

  const referencedImages = new Set<string>();
  if (manifest) {
    for (const item of manifest.items) {
      if (item.imageFileName) referencedImages.add(item.imageFileName);
      if (item.images) {
        for (const arr of Object.values(item.images)) {
          if (Array.isArray(arr)) {
            for (const entry of arr) {
              if (typeof entry === 'string') referencedImages.add(entry);
              else if (entry && typeof entry === 'object' && 'fileName' in entry) referencedImages.add((entry as { fileName: string }).fileName);
            }
          }
        }
      }
    }
  }

  const missingImages = [...referencedImages].filter(name => !allImageNames.has(name));

  const handleImport = async () => {
    if (!manifest) return;
    setImporting(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('manifest', JSON.stringify(manifest));
      for (const file of imageFiles) {
        formData.append('images', file);
      }

      const res = await fetch('http://localhost:3001/api/batch-import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      setResult(data);
    } catch (err: unknown) {
      setError('Network error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImporting(false);
    }
  };

  const removeItemImage = (itemIndex: number, category: string, fileName: string) => {
    if (!manifest) return;
    const newItems = [...manifest.items];
    const item = newItems[itemIndex];

    if (category === 'main' && item.imageFileName === fileName) {
      item.imageFileName = '';
    } else if (item.images) {
      if (category === 'avatarFrame' && item.images.avatarFrame) {
        item.images.avatarFrame = item.images.avatarFrame.filter(f => f.fileName !== fileName);
      } else if (category !== 'avatarFrame' && Array.isArray(item.images[category as keyof typeof item.images])) {
        const list = item.images[category as keyof typeof item.images] as string[];
        // @ts-expect-error dynamic key access
        item.images[category] = list.filter(f => f !== fileName);
      }
    }
    setManifest({ ...manifest, items: newItems });
  };

  const addItemImage = (itemIndex: number, category: string, files: File[]) => {
    if (!manifest || files.length === 0) return;
    
    // Add to imageFiles if not exists
    const newFiles = [...imageFiles];
    let changed = false;
    files.forEach(f => {
      if (!newFiles.some(nf => nf.name === f.name)) {
        newFiles.push(f);
        changed = true;
      }
    });
    if (changed) setImageFiles(newFiles);

    // Add filename to manifest
    const newItems = [...manifest.items];
    const item = newItems[itemIndex];
    if (!item.images) item.images = {};

    files.forEach(f => {
      if (category === 'main') {
        item.imageFileName = f.name;
      } else if (category === 'avatarFrame') {
        if (!item.images!.avatarFrame) item.images!.avatarFrame = [];
        item.images!.avatarFrame.push({ fileName: f.name, type: 'Creator', level: 'LV1' });
      } else {
        // @ts-expect-error dynamic key init
        if (!item.images[category]) item.images[category] = [];
        // @ts-expect-error dynamic key access
        if (!item.images[category].includes(f.name)) {
          // @ts-expect-error dynamic key push
          item.images[category].push(f.name);
        }
      }
    });
    setManifest({ ...manifest, items: newItems });
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <Link to="/" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft size={20} className="mr-2" />
        Back to List
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h1 className="text-xl font-bold text-gray-900">批量导入 Batch Import</h1>
          <p className="text-sm text-gray-500 mt-1">上传 JSON 配置文件 + 图片文件夹，一次性导入多条 KV 数据</p>
        </div>

        <div className="p-8 space-y-8">

          {/* Step 1: JSON */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">1</div>
              <h3 className="text-lg font-medium text-gray-900">上传 JSON 配置文件</h3>
            </div>
            <p className="text-sm text-gray-500 mb-3 ml-9">
              JSON 文件描述要导入的 KV 列表及其标签，图片以文件名引用。
              <button type="button" onClick={() => setShowExample(!showExample)} className="ml-2 text-blue-600 hover:underline inline-flex items-center gap-1">
                <Info size={13} /> 查看格式示例
              </button>
            </p>

            {showExample && (
              <pre className="ml-9 mb-4 bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto max-h-80 overflow-y-auto">{EXAMPLE_JSON}</pre>
            )}

            <div className="ml-9">
              <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleJsonFile} />
              <button type="button" onClick={() => jsonInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                <FileJson size={18} />
                {jsonFileName || '选择 JSON 文件'}
              </button>

              {manifest && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                  <CheckCircle2 size={15} className="inline mr-1.5 -mt-0.5" />
                  解析成功：共 <strong>{manifest.items.length}</strong> 条记录
                  {referencedImages.size > 0 && <span>，引用了 <strong>{referencedImages.size}</strong> 个图片文件</span>}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Images */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">2</div>
              <h3 className="text-lg font-medium text-gray-900">上传图片文件</h3>
            </div>
            <p className="text-sm text-gray-500 mb-3 ml-9">
              选择 JSON 中引用的所有图片文件（支持多选，可全选文件夹内所有图片）。
            </p>
            <div className="ml-9">
              <input ref={imagesInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageFiles} />
              <button type="button" onClick={() => imagesInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                <FolderOpen size={18} />
                {imageFiles.length > 0 ? `已选择 ${imageFiles.length} 个文件` : '选择图片文件'}
              </button>

              {imageFiles.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  {imageFiles.slice(0, 8).map(f => f.name).join(', ')}
                  {imageFiles.length > 8 && ` ... 等共 ${imageFiles.length} 个`}
                </p>
              )}

              {manifest && missingImages.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <AlertCircle size={15} className="inline mr-1.5 -mt-0.5" />
                  以下 JSON 中引用的图片未找到对应文件（{missingImages.length} 个）：
                  <div className="mt-1 text-xs text-amber-600 font-mono">{missingImages.join(', ')}</div>
                </div>
              )}

              {manifest && missingImages.length === 0 && referencedImages.size > 0 && imageFiles.length > 0 && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  <CheckCircle2 size={15} className="inline mr-1.5 -mt-0.5" />
                  所有引用的图片文件已匹配
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Preview & Import */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">3</div>
              <h3 className="text-lg font-medium text-gray-900">预览 & 导入</h3>
            </div>

            {manifest && manifest.items.length > 0 && (
              <div className="ml-9 mb-4">
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr className="text-gray-500 text-xs">
                        <th className="w-10 p-2.5 text-center"></th>
                        <th className="p-2.5 text-left font-medium">#</th>
                        <th className="p-2.5 text-left font-medium">Title</th>
                        <th className="p-2.5 text-left font-medium">Region</th>
                        <th className="p-2.5 text-left font-medium">Level</th>
                        <th className="p-2.5 text-left font-medium">Main Image</th>
                        <th className="p-2.5 text-left font-medium">Assets</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {manifest.items.map((item, idx) => {
                        const assetCount = item.images
                          ? Object.values(item.images).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
                          : 0;
                        const isExpanded = expandedIndex === idx;
                        
                        return (
                          <Fragment key={idx}>
                            <tr 
                              className={`text-gray-700 text-xs hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : ''}`}
                              onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                            >
                              <td className="p-2.5 text-center text-gray-400">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-2.5 text-gray-400">{idx + 1}</td>
                              <td className="p-2.5 font-medium max-w-[200px] truncate">{item.title || '—'}</td>
                              <td className="p-2.5">{item.region || '—'}</td>
                              <td className="p-2.5">{item.level || '—'}</td>
                              <td className="p-2.5 font-mono text-gray-500 max-w-[150px] truncate">
                                {item.imageFileName ? (
                                  <div className="flex items-center gap-2">
                                    {previewUrls[item.imageFileName] ? (
                                      <AutoRatioImage
                                        src={previewUrls[item.imageFileName]}
                                        alt=""
                                        fallbackRatio={1}
                                        containerClassName="w-6 rounded bg-gray-200 border border-gray-300 overflow-hidden flex-shrink-0"
                                      />
                                    ) : (
                                      <div className="w-6 rounded bg-gray-200 border border-gray-300 overflow-hidden flex-shrink-0" style={{ aspectRatio: '1' }} />
                                    )}
                                    <span className="truncate">{item.imageFileName}</span>
                                  </div>
                                ) : '—'}
                              </td>
                              <td className="p-2.5">{assetCount > 0 ? `${assetCount} files` : '—'}</td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-gray-50/50">
                                <td colSpan={7} className="p-4 border-b border-gray-100 shadow-inner">
                                  <div className="space-y-4">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Image Assets Preview & Edit</p>
                                    
                                    {/* Main Image */}
                                    <div className="mb-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-gray-700">Main KV Image</span>
                                        <label className="cursor-pointer text-xs text-blue-600 hover:underline flex items-center gap-1">
                                          <Plus size={12} /> Change/Set Main
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            if (e.target.files?.[0]) addItemImage(idx, 'main', [e.target.files[0]]);
                                          }} />
                                        </label>
                                      </div>
                                      {item.imageFileName ? (
                                        <div className="relative w-32 group">
                                          {previewUrls[item.imageFileName] ? (
                                            <AutoRatioImage
                                              src={previewUrls[item.imageFileName]}
                                              alt=""
                                              fallbackRatio={4 / 3}
                                              containerClassName="w-32 bg-white border border-gray-200 rounded-lg overflow-hidden"
                                            />
                                          ) : (
                                            <div className="w-32 bg-white border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center text-gray-300 text-xs bg-gray-50" style={{ aspectRatio: '4 / 3' }}>
                                              Missing File
                                            </div>
                                          )}
                                          <p className="text-[10px] text-gray-500 mt-1 truncate" title={item.imageFileName}>{item.imageFileName}</p>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); removeItemImage(idx, 'main', item.imageFileName!); }}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ) : <div className="text-xs text-gray-400 italic">No main image set</div>}
                                    </div>

                                    {/* Other Categories */}
                                    {['kv', 'h5', 'banner1029x276', 'banner750x500', 'icons'].map(cat => {
                                      const images = (item.images?.[cat as keyof typeof item.images] as string[]) || [];
                                      return (
                                        <div key={cat} className="mb-4">
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-gray-700 capitalize">{cat.replace(/([A-Z])/g, ' $1').trim()}</span>
                                            <label className="cursor-pointer text-xs text-blue-600 hover:underline flex items-center gap-1">
                                              <Plus size={12} /> Add
                                              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                                                if (e.target.files?.length) addItemImage(idx, cat, Array.from(e.target.files));
                                              }} />
                                            </label>
                                          </div>
                                          {images.length > 0 ? (
                                            <div className="flex gap-3 overflow-x-auto pb-2">
                                              {images.map((fileName, i) => (
                                                <div key={i} className="relative flex-shrink-0 w-24 group">
                                                  {previewUrls[fileName] ? (
                                                    <AutoRatioImage
                                                      src={previewUrls[fileName]}
                                                      alt=""
                                                      fallbackRatio={4 / 3}
                                                      containerClassName="w-24 bg-white border border-gray-200 rounded overflow-hidden"
                                                    />
                                                  ) : (
                                                    <div className="w-24 bg-white border border-gray-200 rounded overflow-hidden flex items-center justify-center text-gray-300 text-[10px] bg-gray-50" style={{ aspectRatio: '4 / 3' }}>
                                                      Missing
                                                    </div>
                                                  )}
                                                  <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={fileName}>{fileName}</p>
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); removeItemImage(idx, cat, fileName); }}
                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                                                  >
                                                    <X size={10} />
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          ) : <div className="text-xs text-gray-400 italic">Empty</div>}
                                        </div>
                                      );
                                    })}

                                    {/* Avatar Frames */}
                                    <div className="mb-2">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-gray-700">Avatar Frames</span>
                                        <label className="cursor-pointer text-xs text-blue-600 hover:underline flex items-center gap-1">
                                          <Plus size={12} /> Add
                                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                                            if (e.target.files?.length) addItemImage(idx, 'avatarFrame', Array.from(e.target.files));
                                          }} />
                                        </label>
                                      </div>
                                      {item.images?.avatarFrame && item.images.avatarFrame.length > 0 ? (
                                        <div className="flex gap-3 overflow-x-auto pb-2">
                                          {item.images.avatarFrame.map((af, i) => (
                                            <div key={i} className="relative flex-shrink-0 w-24 group">
                                              {previewUrls[af.fileName] ? (
                                                <AutoRatioImage
                                                  src={previewUrls[af.fileName]}
                                                  alt=""
                                                  fallbackRatio={4 / 3}
                                                  containerClassName="w-24 bg-white border border-gray-200 rounded overflow-hidden"
                                                />
                                              ) : (
                                                <div className="w-24 bg-white border border-gray-200 rounded overflow-hidden flex items-center justify-center text-gray-300 text-[10px] bg-gray-50" style={{ aspectRatio: '4 / 3' }}>
                                                  Missing
                                                </div>
                                              )}
                                              <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={af.fileName}>{af.fileName}</p>
                                              <div className="flex gap-1 mt-1">
                                                <span className="text-[9px] bg-gray-200 px-1 rounded">{af.type}</span>
                                                <span className="text-[9px] bg-gray-200 px-1 rounded">{af.level}</span>
                                              </div>
                                              <button 
                                                onClick={(e) => { e.stopPropagation(); removeItemImage(idx, 'avatarFrame', af.fileName); }}
                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                                              >
                                                <X size={10} />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : <div className="text-xs text-gray-400 italic">Empty</div>}
                                    </div>

                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="ml-9">
              <button
                type="button"
                onClick={handleImport}
                disabled={!manifest || importing}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                {importing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" /> 导入中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload size={18} /> 开始批量导入
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <AlertCircle size={15} className="inline mr-1.5 -mt-0.5" /> {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-2 text-green-800 font-semibold mb-3">
                <CheckCircle2 size={20} /> 导入成功！共导入 {result.imported} 条记录
              </div>
              <div className="space-y-1">
                {result.items.map(item => (
                  <div key={item.id} className="text-sm text-green-700 flex items-center gap-2">
                    <span className="font-mono text-xs text-green-500">{item.id}</span>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
              <Link to="/" className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">
                返回列表查看 →
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default BatchImportPage;

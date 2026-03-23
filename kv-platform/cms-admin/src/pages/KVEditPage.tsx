import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, X, Loader2, Check, Trash2 } from 'lucide-react';
import { ImageUploadGroup, FileUploadButton, type ImageItem } from '../components/ImageUploadGroup';
import { AutoRatioImage } from '../components/AutoRatioImage';

interface TagOptions {
  [key: string]: string[];
}

interface FigmaFrame {
  nodeId: string;
  name: string;
  pageName: string;
  imageUrl: string;
  parsedLevel: string;
  parsedRegion: string;
  parsedTitle: string;
  figmaNodeUrl: string;
}

interface AvatarFrameImage {
  id: string;
  url: string;
  type: 'Creator' | 'Viewer';
  level: 'LV1' | 'LV2' | 'LV3&4';
}

interface Images {
  kv: ImageItem[];
  h5: ImageItem[];
  banner1029x276: ImageItem[];
  banner750x500: ImageItem[];
  avatarFrame: AvatarFrameImage[];
  icons: ImageItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  theme: '主题 Theme',
  style: '风格 Style',
  colorTone: '色调 ColorTone',
  vibe: '氛围 Vibe',
  element: '元素 Element',
  size: '尺寸 Size',
  ipCampaign: 'IP活动',
  collaboration: '联名 Collaboration'
};

const IMAGE_SECTIONS: { key: keyof Omit<Images, 'avatarFrame'>; label: string; required: boolean; hint?: string }[] = [
  { key: 'kv', label: 'KV 主图', required: true },
  { key: 'h5', label: 'H5', required: true },
  { key: 'banner1029x276', label: 'Banner (1029×276)', required: true, hint: '1029×276 px' },
  { key: 'banner750x500', label: 'Banner (750×500)', required: true, hint: '750×500 px' },
  { key: 'icons', label: 'Icons', required: false },
];

const emptyImages = (): Images => ({
  kv: [],
  h5: [],
  banner1029x276: [],
  banner750x500: [],
  avatarFrame: [],
  icons: [],
});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const KVEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [formData, setFormData] = useState({
    title: '',
    date: '',
    region: 'GLOBAL',
    level: 'TOP',
    imageUrl: '',
    isIP: false,
    type: 'Key Visual',
    gameplay: '',
    figmaUrl: '',
    categories: {
      theme: '节日',
      style: '2DFlat',
      colorTone: 'Warm',
      vibe: 'Happy',
      element: 'Star',
      size: '900',
      ipCampaign: 'NonIP',
      collaboration: 'Non collaborate'
    }
  });

  const [images, setImages] = useState<Images>(emptyImages());
  const [loading, setLoading] = useState(isEditing);
  const [tagOptions, setTagOptions] = useState<TagOptions>({});
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');

  // Figma sync state
  const [createTab, setCreateTab] = useState<'figma' | 'manual'>('figma');
  const [figmaInput, setFigmaInput] = useState('');
  const [figmaToken, setFigmaToken] = useState(() => localStorage.getItem('figma_token') || '');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [figmaFrames, setFigmaFrames] = useState<FigmaFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [figmaFileName, setFigmaFileName] = useState('');

  useEffect(() => {
    fetch('http://localhost:3001/api/tag-options')
      .then(res => res.json())
      .then(data => setTagOptions(data));

    if (isEditing) {
      fetch(`http://localhost:3001/api/kvs/${id}`)
        .then(res => res.json())
        .then(data => {
          setFormData({
            ...data,
            categories: data.categories || {
              theme: '', style: '', colorTone: '', vibe: '', element: '', size: '', ipCampaign: '', collaboration: ''
            }
          });
          if (data.images) {
            setImages({ ...emptyImages(), ...data.images });
          } else if (data.imageUrl) {
            setImages({ ...emptyImages(), kv: [{ id: uid(), url: data.imageUrl }] });
          }
          setLoading(false);
        });
    }
  }, [id, isEditing]);

  // ── Figma sync ──
  const handleFigmaSync = async () => {
    if (!figmaInput.trim() || !figmaToken.trim()) {
      setSyncError('Please provide both Figma URL and Token.');
      return;
    }
    setSyncing(true);
    setSyncError('');
    setFigmaFrames([]);
    setSelectedFrame(null);
    localStorage.setItem('figma_token', figmaToken);

    try {
      const res = await fetch('http://localhost:3001/api/figma-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl: figmaInput, token: figmaToken })
      });
      const data = await res.json();
      if (!res.ok) { setSyncError(data.error || 'Sync failed'); return; }
      setFigmaFrames(data.frames || []);
      setFigmaFileName(data.fileName || '');
      if (data.frames?.length === 0) setSyncError('No top-level frames found in this Figma file.');
    } catch (err: unknown) {
      setSyncError('Network error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectFrame = (frame: FigmaFrame) => {
    setSelectedFrame(frame.nodeId);
    if (frame.imageUrl) {
      setImages(prev => {
        const existing = prev.kv.some(i => i.url === frame.imageUrl);
        return existing ? prev : { ...prev, kv: [...prev.kv, { id: uid(), url: frame.imageUrl }] };
      });
    }
    setFormData(prev => ({
      ...prev,
      title: frame.parsedTitle || prev.title,
      figmaUrl: frame.figmaNodeUrl || prev.figmaUrl,
      level: frame.parsedLevel || prev.level,
      region: frame.parsedRegion || prev.region,
    }));
  };

  // ── File upload helper ──
  const uploadFiles = useCallback(async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await fetch('http://localhost:3001/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    return data.urls || [];
  }, []);

  // ── Image management ──
  const addImageUrls = (section: keyof Omit<Images, 'avatarFrame'>, urls: string[]) => {
    setImages(prev => ({
      ...prev,
      [section]: [...prev[section], ...urls.map(url => ({ id: uid(), url }))]
    }));
  };

  const removeImage = (section: keyof Images, imgId: string) => {
    setImages(prev => ({
      ...prev,
      [section]: (prev[section] as { id: string }[]).filter(i => i.id !== imgId)
    }));
  };

  const addAvatarFrameUrls = (urls: string[]) => {
    setImages(prev => ({
      ...prev,
      avatarFrame: [...prev.avatarFrame, ...urls.map(url => ({ id: uid(), url, type: 'Creator' as const, level: 'LV1' as const }))]
    }));
  };

  const updateAvatarFrame = (imgId: string, field: 'type' | 'level', value: string) => {
    setImages(prev => ({
      ...prev,
      avatarFrame: prev.avatarFrame.map(i => i.id === imgId ? { ...i, [field]: value } : i)
    }));
  };

  // ── Form submit ──
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const primaryImage = images.kv[0]?.url || '';
    const payload = { ...formData, imageUrl: primaryImage, images };

    const url = isEditing ? `http://localhost:3001/api/kvs/${id}` : 'http://localhost:3001/api/kvs';
    const method = isEditing ? 'PUT' : 'POST';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(() => navigate('/'));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name.startsWith('categories.')) {
      const catField = name.split('.')[1];
      if (value === '__add_new__') { setAddingTo(catField); setNewValue(''); return; }
      setFormData(prev => ({ ...prev, categories: { ...prev.categories, [catField]: value } }));
    } else {
      const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
      setFormData(prev => ({ ...prev, [name]: val }));
    }
  };

  const handleAddNewTag = (category: string) => {
    if (!newValue.trim()) return;
    fetch(`http://localhost:3001/api/tag-options/${category}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: newValue.trim() })
    })
      .then(res => res.json())
      .then(updatedOptions => {
        setTagOptions(prev => ({ ...prev, [category]: updatedOptions }));
        setFormData(prev => ({ ...prev, categories: { ...prev.categories, [category]: newValue.trim() } }));
        setAddingTo(null);
        setNewValue('');
      });
  };

  if (loading) return <div className="text-center mt-10">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <Link to="/" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft size={20} className="mr-2" />
        Back to List
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h1 className="text-xl font-bold text-gray-900">
            {isEditing ? 'Edit Key Visual' : 'Create New Key Visual'}
          </h1>
        </div>

        {/* Tab switcher — only show when creating */}
        {!isEditing && (
          <div className="flex border-b border-gray-200">
            <button type="button" onClick={() => setCreateTab('figma')}
              className={`flex-1 py-3.5 text-sm font-semibold text-center transition-colors relative ${createTab === 'figma' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              Sync from Figma
              {createTab === 'figma' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
            <button type="button" onClick={() => setCreateTab('manual')}
              className={`flex-1 py-3.5 text-sm font-semibold text-center transition-colors relative ${createTab === 'manual' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              Manual Upload
              {createTab === 'manual' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-8 space-y-8">

          {/* ===== Figma Sync Section ===== */}
          {!isEditing && createTab === 'figma' && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">Figma Sync</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Figma File URL</label>
                    <input type="url" value={figmaInput} onChange={e => setFigmaInput(e.target.value)}
                      placeholder="https://www.figma.com/file/..."
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Figma Personal Access Token</label>
                    <input type="password" value={figmaToken} onChange={e => setFigmaToken(e.target.value)}
                      placeholder="figd_xxxxxxxxx"
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                </div>

                <button type="button" onClick={handleFigmaSync} disabled={syncing}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
                  {syncing ? <><Loader2 size={18} className="animate-spin" />Syncing...</> : 'Start Sync'}
                </button>

                {syncError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{syncError}</div>}

                {figmaFrames.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">
                      Found <span className="font-semibold">{figmaFrames.length}</span> frames in{' '}
                      <span className="font-semibold">{figmaFileName}</span>. Click to add to KV images:
                    </p>
                    <div className="flex gap-4 overflow-x-auto pb-3 -mx-2 px-2">
                      {figmaFrames.map(frame => (
                        <button key={frame.nodeId} type="button" onClick={() => handleSelectFrame(frame)}
                          className={`flex-shrink-0 w-44 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                            selectedFrame === frame.nodeId ? 'border-blue-500 shadow-lg shadow-blue-100 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                          }`}>
                          <div className="relative w-full bg-gray-100">
                            {frame.imageUrl ? (
                              <AutoRatioImage
                                src={frame.imageUrl}
                                alt={frame.name}
                                fallbackRatio={4 / 3}
                                containerClassName="w-full overflow-hidden"
                              />
                            ) : (
                              <div className="w-full h-28 flex items-center justify-center text-gray-400 text-xs">No preview</div>
                            )}
                            {selectedFrame === frame.nodeId && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"><Check size={14} className="text-white" /></div>
                            )}
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs font-medium text-gray-900 truncate" title={frame.name}>{frame.name}</p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{frame.pageName}</p>
                            {(frame.parsedLevel || frame.parsedRegion) && (
                              <div className="flex gap-1 mt-1.5">
                                {frame.parsedLevel && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">{frame.parsedLevel}</span>}
                                {frame.parsedRegion && <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{frame.parsedRegion}</span>}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== Image Upload Section (shared by both tabs) ===== */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">
              素材图片 Assets
            </h3>

            <div className="space-y-6">
              {/* Standard image sections: KV, H5, Banners, Icons */}
              {IMAGE_SECTIONS.map(section => (
                <ImageUploadGroup
                  key={section.key}
                  label={section.label}
                  hint={section.hint}
                  required={section.required}
                  items={images[section.key]}
                  onUpload={async (files) => { const urls = await uploadFiles(files); addImageUrls(section.key, urls); }}
                  onRemove={imgId => removeImage(section.key, imgId)}
                />
              ))}

              {/* Avatar Frame — special section with type/level tags */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700">头像框 Avatar Frame</span>
                    <span className="ml-2 text-xs text-gray-400">选填 Optional</span>
                  </div>
                  <FileUploadButton onUpload={async (files) => { const urls = await uploadFiles(files); addAvatarFrameUrls(urls); }} />
                </div>

                {images.avatarFrame.length === 0 ? (
                  <p className="text-xs text-gray-400">暂无图片</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {images.avatarFrame.map(img => (
                      <div key={img.id} className="flex gap-3 items-start bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <AutoRatioImage
                          src={img.url}
                          alt=""
                          fallbackRatio={1}
                          containerClassName="w-16 rounded-md overflow-hidden border border-gray-200 bg-white flex-shrink-0"
                          imgClassName="bg-white"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-xs text-gray-500 truncate" title={img.url}>{img.url}</p>
                          <div className="flex gap-2">
                            <select value={img.type} onChange={e => updateAvatarFrame(img.id, 'type', e.target.value)}
                              className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none">
                              <option value="Creator">Creator</option>
                              <option value="Viewer">Viewer</option>
                            </select>
                            <select value={img.level} onChange={e => updateAvatarFrame(img.id, 'level', e.target.value)}
                              className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none">
                              <option value="LV1">LV1</option>
                              <option value="LV2">LV2</option>
                              <option value="LV3&4">LV3&4</option>
                            </select>
                          </div>
                        </div>
                        <button type="button" onClick={() => removeImage('avatarFrame', img.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== Basic Info ===== */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Title</label>
                <input required type="text" name="title" value={formData.title} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input required type="date" name="date" value={formData.date} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <select name="region" value={formData.region} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                  {['GLOBAL','US','EU','SEA','NEA','CN','LATAM','MENA','ANZ'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <select name="level" value={formData.level} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                  {['TOP','MATURE','MID','LOW'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ===== Tag Categories ===== */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">Tag Categories (分类标签)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  {addingTo === key ? (
                    <div className="flex gap-2">
                      <input type="text" autoFocus value={newValue} onChange={e => setNewValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewTag(key); } }}
                        placeholder="Enter new value..."
                        className="flex-1 border border-blue-400 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      <button type="button" onClick={() => handleAddNewTag(key)} className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"><Plus size={16} /></button>
                      <button type="button" onClick={() => setAddingTo(null)} className="p-2.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"><X size={16} /></button>
                    </div>
                  ) : (
                    <select name={`categories.${key}`} value={formData.categories[key as keyof typeof formData.categories]} onChange={handleChange}
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none">
                      {(tagOptions[key] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      <option disabled>──────────</option>
                      <option value="__add_new__">+ Add New...</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ===== Details ===== */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">Campaign Details</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gameplay Description</label>
                <textarea rows={3} name="gameplay" value={formData.gameplay} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Describe how the campaign works..." />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isIP" name="isIP" checked={formData.isIP} onChange={handleChange}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                <label htmlFor="isIP" className="text-sm font-medium text-gray-700">Is this an IP Collaboration?</label>
              </div>
            </div>
          </div>

          {/* ===== Integration ===== */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b border-gray-100">Integrations</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Figma URL</label>
              <input type="url" name="figmaUrl" value={formData.figmaUrl} onChange={handleChange}
                placeholder="https://figma.com/..."
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>

          {/* ===== Actions ===== */}
          <div className="pt-6 border-t border-gray-200 flex justify-end gap-4">
            <Link to="/" className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">Cancel</Link>
            <button type="submit" className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center gap-2 transition-colors shadow-sm">
              <Save size={20} />
              {isEditing ? 'Save Changes' : 'Create KV'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

/* ─── Reusable image upload group (file + paste) ─── */
/* Extracted to src/components/ImageUploadGroup.tsx */

export default KVEditPage;

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Calendar, Image, Smartphone, LayoutTemplate, UserCircle, Sparkles } from 'lucide-react';
import { AutoRatioImage } from '../components/AutoRatioImage';

interface ImageItem {
  id: string;
  url: string;
}

interface AvatarFrameImage extends ImageItem {
  type: string;
  level: string;
}

interface Images {
  kv?: ImageItem[];
  h5?: ImageItem[];
  banner1029x276?: ImageItem[];
  banner750x500?: ImageItem[];
  avatarFrame?: AvatarFrameImage[];
  icons?: ImageItem[];
}

interface KVDetail {
  id: string;
  title: string;
  date: string;
  region: string;
  level: string;
  imageUrl: string;
  isIP: boolean;
  images?: Images;
  categories?: {
    theme: string;
    style: string;
    colorTone: string;
    vibe: string;
    element: string;
    size: string;
    ipCampaign: string;
    collaboration: string;
  };
  type: string;
  gameplay: string;
  figmaUrl: string;
}

const IMAGE_SECTIONS: { key: keyof Images; label: string; icon: typeof Image; accent: string }[] = [
  { key: 'kv', label: 'KV 主图', icon: Image, accent: 'from-blue-500/20 to-blue-600/5 border-blue-500/20' },
  { key: 'h5', label: 'H5', icon: Smartphone, accent: 'from-green-500/20 to-green-600/5 border-green-500/20' },
  { key: 'banner1029x276', label: 'Banner (1029×276)', icon: LayoutTemplate, accent: 'from-amber-500/20 to-amber-600/5 border-amber-500/20' },
  { key: 'banner750x500', label: 'Banner (750×500)', icon: LayoutTemplate, accent: 'from-orange-500/20 to-orange-600/5 border-orange-500/20' },
  { key: 'avatarFrame', label: '头像框 Avatar Frame', icon: UserCircle, accent: 'from-purple-500/20 to-purple-600/5 border-purple-500/20' },
  { key: 'icons', label: 'Icons', icon: Sparkles, accent: 'from-pink-500/20 to-pink-600/5 border-pink-500/20' },
];

const KVDetailPage = () => {
  const { id } = useParams();
  const [kv, setKv] = useState<KVDetail | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`http://localhost:3001/api/kvs/${id}`).then(res => res.json()),
      fetch('http://localhost:3001/api/settings').then(res => res.json())
    ])
    .then(([kvData, settingsData]) => {
      setKv(kvData);
      setSettings(settingsData);
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to fetch detail:', err);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>;
  }

  if (!kv) {
    return <div className="text-center mt-20 text-gray-400">KV not found</div>;
  }

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <Link to="/" className="inline-flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={20} className="mr-2" />
        Back to Gallery
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Image */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl p-2">
            <img 
              src={kv.imageUrl} 
              alt={kv.title} 
              className="w-full h-auto object-contain rounded-xl"
            />
          </div>
          
          {kv.images && (() => {
            const hasAny = IMAGE_SECTIONS.some(s => {
              const items = kv.images?.[s.key];
              return items && items.length > 0;
            });
            if (!hasAny) return (
              <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6">
                <h3 className="text-xl font-semibold mb-4 border-b border-gray-800 pb-3">Asset Resources</h3>
                <p className="text-gray-500 text-sm">No additional assets uploaded yet.</p>
              </div>
            );
            return (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-white">Asset Resources</h3>
                {IMAGE_SECTIONS.map(({ key, label, icon: Icon, accent }) => {
                  const items = kv.images?.[key];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={key} className={`bg-gradient-to-br ${accent} border border-gray-800 rounded-2xl p-5`}>
                      <div className="flex items-center gap-2 mb-4">
                        <Icon size={18} className="text-gray-300" />
                        <h4 className="text-sm font-semibold text-gray-200">{label}</h4>
                        <span className="text-xs text-gray-500 ml-auto">{items.length} file{items.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className={`grid gap-3 ${key === 'icons' || key === 'avatarFrame' ? 'grid-cols-3 md:grid-cols-4' : 'grid-cols-2'}`}>
                        {items.map((img: ImageItem | AvatarFrameImage) => (
                          <div key={img.id} className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-white/25 transition-all hover:shadow-lg hover:shadow-black/30">
                            <AutoRatioImage
                              src={img.url}
                              alt=""
                              fallbackRatio={key === 'icons' || key === 'avatarFrame' ? 1 : 16 / 9}
                              containerClassName="bg-gray-900"
                            />
                            {'type' in img && 'level' in img && (img as AvatarFrameImage).type && (
                              <div className="absolute bottom-2 left-2 flex gap-1">
                                <span className="text-[10px] px-2 py-0.5 bg-purple-600/90 text-white rounded-full font-medium backdrop-blur-sm">{(img as AvatarFrameImage).type}</span>
                                <span className="text-[10px] px-2 py-0.5 bg-amber-600/90 text-white rounded-full font-medium backdrop-blur-sm">{(img as AvatarFrameImage).level}</span>
                              </div>
                            )}
                            <a href={img.url} target="_blank" rel="noreferrer"
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                              <div className="bg-white/20 backdrop-blur-md rounded-full p-2.5 border border-white/20">
                                <Download size={18} className="text-white" />
                              </div>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {!kv.images && (
            <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6">
              <h3 className="text-xl font-semibold mb-4 border-b border-gray-800 pb-3">Asset Resources</h3>
              <p className="text-gray-500 text-sm">No additional assets uploaded yet.</p>
            </div>
          )}
        </div>

        {/* Right Column - Info */}
        <div className="space-y-6">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 shadow-xl">
            <div className="flex gap-2 mb-4">
              <span className="px-2.5 py-1 text-xs font-bold bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/20">
                {kv.level}
              </span>
              <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/20 text-purple-400 rounded-md border border-purple-500/20">
                {kv.region}
              </span>
              {kv.isIP && (
                <span className="px-2.5 py-1 text-xs font-bold bg-yellow-500/20 text-yellow-400 rounded-md border border-yellow-500/20">
                  IP
                </span>
              )}
            </div>
            
            <h1 className="text-3xl font-bold text-white mb-2">{kv.title}</h1>
            <p className="text-gray-400 flex items-center mb-6">
              <Calendar size={16} className="mr-2" />
              {kv.date}
            </p>

            <div className="space-y-3">
              <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-600/20">
                <Download size={20} />
                Download KV (PNG)
              </button>
              <button className="w-full flex items-center justify-center gap-2 bg-[#1F2937] hover:bg-[#374151] border border-gray-700 text-white py-3 rounded-xl font-medium transition-all">
                <Download size={20} className="text-gray-400" />
                Download Asset Package (ZIP)
              </button>
              <a href={kv.figmaUrl} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-gray-800 border border-gray-700 text-gray-300 py-3 rounded-xl font-medium transition-all mt-2">
                <ExternalLink size={20} />
                Open in Figma
              </a>
            </div>
          </div>

          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Campaign Gameplay</h3>
            <p className="text-gray-400 text-sm leading-relaxed bg-gray-800/30 p-4 rounded-xl border border-gray-800/50">
              {kv.gameplay}
            </p>
          </div>

          {kv.categories && settings?.displayTags && (
            <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-3 text-white">Categories</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries({
                  theme: '主题', style: '风格', colorTone: '色调', vibe: '氛围',
                  element: '元素', size: '尺寸', ipCampaign: 'IP活动', collaboration: '联名'
                }).map(([key, label]) => {
                  if (settings.displayTags[key] && kv.categories?.[key as keyof typeof kv.categories]) {
                    return (
                      <span key={key} className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm">
                        <span className="text-gray-500 mr-1">{label}:</span> 
                        {kv.categories[key as keyof typeof kv.categories]}
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KVDetailPage;

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Image, Smartphone, LayoutTemplate, UserCircle, Sparkles } from 'lucide-react';
import { AutoRatioImage } from '../components/AutoRatioImage';

interface ImageItem { id: string; url: string; }
interface Images {
  kv?: ImageItem[];
  h5?: ImageItem[];
  banner1029x276?: ImageItem[];
  banner750x500?: ImageItem[];
  avatarFrame?: ImageItem[];
  icons?: ImageItem[];
}

interface KV {
  id: string;
  title: string;
  date: string;
  region: string;
  level: string;
  imageUrl: string;
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
}

const ASSET_INDICATORS: { key: keyof Images; label: string; icon: typeof Image; color: string }[] = [
  { key: 'kv', label: 'KV', icon: Image, color: 'text-blue-400' },
  { key: 'h5', label: 'H5', icon: Smartphone, color: 'text-green-400' },
  { key: 'banner1029x276', label: 'Banner', icon: LayoutTemplate, color: 'text-amber-400' },
  { key: 'banner750x500', label: 'Banner', icon: LayoutTemplate, color: 'text-amber-400' },
  { key: 'avatarFrame', label: '头像框', icon: UserCircle, color: 'text-purple-400' },
  { key: 'icons', label: 'Icons', icon: Sparkles, color: 'text-pink-400' },
];

const HomePage = () => {
  const [kvs, setKvs] = useState<KV[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:3001/api/kvs?published=true').then(res => res.json()),
      fetch('http://localhost:3001/api/settings').then(res => res.json())
    ])
    .then(([kvData, settingsData]) => {
      setKvs(kvData);
      setSettings(settingsData);
      setLoading(false);
    })
    .catch(err => {
      console.error('Failed to fetch data:', err);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Key Visuals</h2>
          <p className="text-gray-400 mt-1">Browse and download campaign visuals</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-[#111827] border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
            <Filter size={16} />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Tags Filter */}
      <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
        {['All', 'GLOBAL', 'US', 'EU', 'SEA', 'TOP', 'MATURE', 'Spring Festival'].map((tag, idx) => (
          <button 
            key={idx} 
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${idx === 0 ? 'bg-white text-black font-medium' : 'bg-[#111827] border border-gray-700 text-gray-300 hover:border-gray-500'}`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Masonry/Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {kvs.map(kv => (
          <div key={kv.id} className="group relative bg-[#111827] rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 flex flex-col">
            <AutoRatioImage
              src={kv.imageUrl}
              alt={kv.title}
              fallbackRatio={4 / 3}
              containerClassName="relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#111827] via-transparent to-transparent opacity-80"></div>
              
              <div className="absolute top-3 left-3 flex gap-2">
                <span className="px-2.5 py-1 text-xs font-bold bg-black/60 backdrop-blur-md rounded-md border border-white/10 text-white shadow-sm">
                  {kv.level}
                </span>
                <span className="px-2.5 py-1 text-xs font-bold bg-blue-600/80 backdrop-blur-md rounded-md text-white shadow-sm">
                  {kv.region}
                </span>
              </div>

              {/* Hover Actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                <Link to={`/kv/${kv.id}`} className="bg-white text-black px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-100 transition-colors transform translate-y-4 group-hover:translate-y-0 duration-300">
                  View Details
                </Link>
              </div>
            </AutoRatioImage>
            
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-semibold text-lg text-white mb-1 line-clamp-1">{kv.title}</h3>
              <p className="text-gray-400 text-sm mb-3">{kv.date}</p>
              
              {kv.images && (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {(() => {
                    const seen = new Set<string>();
                    return ASSET_INDICATORS.map(({ key, label, icon: Icon, color }) => {
                      const items = kv.images?.[key];
                      if (!items || items.length === 0 || seen.has(label)) return null;
                      seen.add(label);
                      const count = key === 'banner1029x276'
                        ? (kv.images?.banner1029x276?.length || 0) + (kv.images?.banner750x500?.length || 0)
                        : items.length;
                      return (
                        <span key={key} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded ${color}`} title={`${label}: ${count} files`}>
                          <Icon size={10} />
                          {label}
                          {count > 1 && <span className="text-gray-500">×{count}</span>}
                        </span>
                      );
                    });
                  })()}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-auto">
                {kv.categories && settings?.displayTags && Object.entries(kv.categories).slice(0, 3).map(([key, value]) => {
                  if (settings.displayTags[key] && value) {
                    return (
                      <span key={key} className="text-xs px-2.5 py-1 bg-gray-800/50 text-gray-300 rounded-md border border-gray-700/50">
                        {value}
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomePage;

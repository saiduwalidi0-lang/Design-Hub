import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ExternalLink, Settings as SettingsIcon, ChevronDown, Image, Frame, User, Eye, EyeOff, Upload } from 'lucide-react';
import { AutoRatioImage } from '../components/AutoRatioImage';

interface KV {
  id: string;
  title: string;
  date: string;
  region: string;
  level: string;
  imageUrl: string;
  published?: boolean;
}

const CONTENT_CATEGORIES = [
  { key: 'kv', label: 'Key Visual', icon: Image, enabled: true },
  { key: 'icon', label: 'Icon', icon: Frame, enabled: false },
  { key: 'avatar', label: 'Avatar Frame', icon: User, enabled: false },
];

const KVListPage = () => {
  const navigate = useNavigate();
  const [kvs, setKvs] = useState<KV[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    displayTags: {
      theme: true, style: true, colorTone: true, vibe: true,
      element: true, size: true, ipCampaign: true, collaboration: true
    }
  });

  const fetchKVs = () => {
    fetch('http://localhost:3001/api/kvs')
      .then(res => res.json())
      .then(data => {
        setKvs(data);
        setLoading(false);
      });
  };

  const fetchSettings = () => {
    fetch('http://localhost:3001/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.displayTags) {
          setSettings(data);
        }
      });
  };

  useEffect(() => {
    fetchKVs();
    fetchSettings();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this KV?')) {
      fetch(`http://localhost:3001/api/kvs/${id}`, {
        method: 'DELETE',
      }).then(() => {
        fetchKVs();
      });
    }
  };

  const handleTogglePublish = (id: string) => {
    fetch(`http://localhost:3001/api/kvs/${id}/publish`, { method: 'PATCH' })
      .then(res => res.json())
      .then(data => {
        setKvs(prev => prev.map(k => k.id === id ? { ...k, published: data.published } : k));
      });
  };

  const handleToggleSetting = (key: string) => {
    const newSettings = {
      ...settings,
      displayTags: {
        ...settings.displayTags,
        [key]: !settings.displayTags[key as keyof typeof settings.displayTags]
      }
    };
    setSettings(newSettings);
    
    fetch('http://localhost:3001/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
  };

  if (loading) return <div className="text-center mt-10">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Key Visuals Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage all KV assets displayed on the frontend.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <SettingsIcon size={20} />
            Frontend Display Settings
          </button>
          <Link
            to="/batch-import"
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Upload size={20} />
            批量导入
          </Link>
          <div className="relative" ref={addMenuRef}>
            <button 
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Add New
              <ChevronDown size={16} className={`transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
            </button>
            {showAddMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                {CONTENT_CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.key}
                      disabled={!cat.enabled}
                      onClick={() => {
                        if (cat.enabled) {
                          setShowAddMenu(false);
                          navigate('/create');
                        }
                      }}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm ${
                        cat.enabled
                          ? 'text-gray-900 hover:bg-blue-50 cursor-pointer'
                          : 'text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="flex-1 font-medium">{cat.label}</span>
                      {!cat.enabled && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Coming Soon</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Select Tag Categories to Display on Frontend</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries({
              theme: '主题 Theme', style: '风格 Style', colorTone: '色调 ColorTone', vibe: '氛围 Vibe',
              element: '元素 Element', size: '尺寸 Size', ipCampaign: 'IP活动', collaboration: '联名 Collaboration'
            }).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                <input 
                  type="checkbox" 
                  checked={settings.displayTags[key as keyof typeof settings.displayTags]} 
                  onChange={() => handleToggleSetting(key)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-sm">
              <th className="p-4 font-medium">Image</th>
              <th className="p-4 font-medium">Title</th>
              <th className="p-4 font-medium">Region/Level</th>
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium text-center">Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {kvs.map(kv => (
              <tr key={kv.id} className="hover:bg-gray-50 transition-colors group">
                <td className="p-4 w-32">
                  <AutoRatioImage
                    src={kv.imageUrl}
                    alt={kv.title}
                    fallbackRatio={4 / 3}
                    containerClassName="w-24 rounded-md overflow-hidden border border-gray-200 bg-gray-50"
                  />
                </td>
                <td className="p-4">
                  <p className="font-medium text-gray-900">{kv.title}</p>
                  <p className="text-xs text-gray-500 mt-1">ID: {kv.id}</p>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium">{kv.region}</span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md font-medium">{kv.level}</span>
                  </div>
                </td>
                <td className="p-4 text-gray-500 text-sm">
                  {kv.date}
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => handleTogglePublish(kv.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      kv.published !== false
                        ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                    }`}
                    title={kv.published !== false ? '点击下线' : '点击上线'}
                  >
                    {kv.published !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                    {kv.published !== false ? '已上线' : '已下线'}
                  </button>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={`http://localhost:5177/kv/${kv.id}`} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-blue-600 bg-white rounded-md border border-gray-200 shadow-sm" title="View on Frontend">
                      <ExternalLink size={16} />
                    </a>
                    <Link to={`/edit/${kv.id}`} className="p-2 text-gray-400 hover:text-green-600 bg-white rounded-md border border-gray-200 shadow-sm" title="Edit">
                      <Edit2 size={16} />
                    </Link>
                    <button onClick={() => handleDelete(kv.id)} className="p-2 text-gray-400 hover:text-red-600 bg-white rounded-md border border-gray-200 shadow-sm" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {kvs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">No Key Visuals found. Create one!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KVListPage;

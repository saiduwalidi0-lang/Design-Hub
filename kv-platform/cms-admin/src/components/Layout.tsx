import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Image, Settings, Users, Database, Zap } from 'lucide-react';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '#', icon: <LayoutDashboard size={20} /> },
    { name: 'Key Visuals', path: '/', icon: <Image size={20} /> },
    { name: 'Figma 爬取工具', path: '/figma-crawl', icon: <Zap size={20} /> },
    { name: 'Assets', path: '#', icon: <Database size={20} /> },
    { name: 'Users', path: '#', icon: <Users size={20} /> },
    { name: 'Settings', path: '#', icon: <Settings size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
            <Database className="text-blue-500" size={24} />
            CMS Admin
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 mt-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
              || (location.pathname.startsWith('/edit') && item.name === 'Key Visuals')
              || (location.pathname === '/create' && item.name === 'Key Visuals')
              || (location.pathname === '/batch-import' && item.name === 'Key Visuals')
              || (location.pathname === '/figma-crawl' && item.name === 'Figma 爬取工具');
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center space-x-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
              A
            </div>
            <div>
              <p className="text-sm font-medium">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-end px-8 bg-white border-b border-gray-200 shadow-sm z-0">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Status: <span className="text-green-500 font-medium">● System Online</span></span>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;

import { tools } from '@/tools/registry';
import { useNavigation } from '@/router';

export default function Home() {
  const { navigate } = useNavigation();

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">Design Tools Suite</div>
        <div className="text-xs text-gray-500 mt-0.5">设计团队小工具合集</div>
      </div>

      <div className="p-4 space-y-3">
        {tools.map(tool => (
          <button
            key={tool.id}
            type="button"
            onClick={() => navigate(tool.route)}
            className="w-full text-left block rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all p-3"
          >
            <div className="text-sm font-semibold text-gray-900">{tool.name}</div>
            <div className="text-xs text-gray-500 mt-1">{tool.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import Home from "@/pages/Home";
import { tools } from "@/tools/registry";
import { useHashPath } from '@/router';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null };

  static getDerivedStateFromError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>插件 UI 运行失败</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#f7f7f7', padding: 10, borderRadius: 8 }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { path } = useHashPath();
  const tool = tools.find(t => t.route === path);

  const element = tool ? <tool.Component /> : <Home />;

  return (
    <ErrorBoundary>
      {element}
    </ErrorBoundary>
  );
}

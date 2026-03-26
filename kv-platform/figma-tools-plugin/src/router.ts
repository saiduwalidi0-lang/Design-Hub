import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export function readHashPath(): string {
  const raw = typeof window !== 'undefined' ? window.location.hash : '';
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!h) return '/';
  if (h.startsWith('/')) return h;
  return `/${h}`;
}

type NavigationContextValue = {
  path: string;
  navigate: (to: string) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return ctx;
}

/** Figma WebView 里点击 <a href="#/..."> 有时不触发 hashchange；点击时用 navigate 同步 state + hash。 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => readHashPath());

  useEffect(() => {
    const onChange = () => setPath(readHashPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const normalized = to.startsWith('/') ? to : `/${to}`;
    setPath(normalized);
    const nextHash = `#${normalized}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = normalized;
    }
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);

  return createElement(NavigationContext.Provider, { value }, children);
}

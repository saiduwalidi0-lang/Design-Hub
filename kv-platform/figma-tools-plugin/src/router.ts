import { useEffect, useMemo, useState } from 'react';

function readHashPath() {
  const raw = typeof window !== 'undefined' ? window.location.hash : '';
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!h) return '/';
  if (h.startsWith('/')) return h;
  return `/${h}`;
}

export function useHashPath() {
  const [path, setPath] = useState<string>(() => readHashPath());

  useEffect(() => {
    const onChange = () => setPath(readHashPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return useMemo(() => ({ path }), [path]);
}

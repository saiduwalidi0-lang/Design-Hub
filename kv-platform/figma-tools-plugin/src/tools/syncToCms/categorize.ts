export type AssetKey = 'kv' | 'h5' | 'banner1029x276' | 'banner750x500' | 'avatarFrame' | 'icons';

export function categorizeNodeName(name: string): AssetKey {
  const n = String(name || '').toLowerCase();

  const has = (s: string) => n.includes(s);
  const hasAny = (arr: string[]) => arr.some(has);

  if (hasAny(['avatar', '头像', 'frame', '头像框'])) return 'avatarFrame';
  if (hasAny(['icon', 'icons', '图标'])) return 'icons';
  if (hasAny(['h5', 'landing', 'webview', 'page'])) return 'h5';
  if (has('1029') && (has('276') || has('x276') || has('×276'))) return 'banner1029x276';
  if (has('750') && (has('500') || has('x500') || has('×500'))) return 'banner750x500';
  if (hasAny(['banner', '横幅'])) {
    if (has('1029') || has('276')) return 'banner1029x276';
    if (has('750') || has('500')) return 'banner750x500';
  }
  return 'kv';
}


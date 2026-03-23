import type { ToolDefinition } from '@/tools/types';
import { CrawlToCmsPage } from '@/tools/crawlToCms/CrawlToCmsPage';
import { KvToAvatarFramePage } from '@/tools/kvToAvatarFrame/KvToAvatarFramePage';
import { SyncToCmsPage } from '@/tools/syncToCms/SyncToCmsPage';

export const tools: ToolDefinition[] = [
  {
    id: 'crawl-to-cms',
    name: 'Figma 爬取 → CMS',
    description: '按 CMS 规则扫描当前文件并导入到 KV CMS。',
    route: '/tools/crawl-to-cms',
    Component: CrawlToCmsPage,
  },
  {
    id: 'sync-to-cms',
    name: '同步到 CMS',
    description: '导出选中节点/当前页素材并导入到 KV CMS。',
    route: '/tools/sync-to-cms',
    Component: SyncToCmsPage,
  },
  {
    id: 'kv-to-avatarframe',
    name: 'KV → 头像框（分图层）',
    description: '选中 Frame/Group 作为 KV，生成三元素与合成并回写为头像框 Frame。',
    route: '/tools/kv-to-avatarframe',
    Component: KvToAvatarFramePage,
  },
];

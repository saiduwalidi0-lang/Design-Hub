type ExportMode = 'selection' | 'page';

type CrawlMode = 'currentFile';

type PluginRequest =
  | { type: 'PING' }
  | { type: 'EXPORT_NODES'; mode: ExportMode; scale: number }
  | { type: 'CRAWL_FILE'; mode: CrawlMode; scale: number }
  | { type: 'EXPORT_KV_FROM_SELECTION'; scale: number }
  | {
      type: 'WRITE_AVATARFRAME_TO_CANVAS';
      frameSize: number;
      anchorNodeId?: string;
      /** 270 坐标系下的矩形；缺省用 L 档默认框位 */
      boxes?: {
        element1: { x: number; y: number; width: number; height: number };
        element2: { x: number; y: number; width: number; height: number };
        element3?: { x: number; y: number; width: number; height: number } | null;
      };
      images: {
        element1Png: Uint8Array;
        element2Png: Uint8Array;
        element3Png?: Uint8Array;
      };
      names?: {
        frame?: string;
        element1?: string;
        element2?: string;
        element3?: string;
      };
    };

type ExportedNode = {
  id: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
  bytes: Uint8Array;
};

type FrameLikeNode = FrameNode | ComponentNode | InstanceNode | GroupNode;

type KvNode = {
  id: string;
  name: string;
  type: SceneNode['type'];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  text?: {
    characters: string;
    fontSize: TextNode['fontSize'];
    textAlignHorizontal: TextNode['textAlignHorizontal'];
    textAlignVertical: TextNode['textAlignVertical'];
  };
};

type PluginResponse =
  | { type: 'PONG'; fileKey: string | undefined }
  | { type: 'EXPORT_START'; total: number }
  | { type: 'EXPORT_ITEM'; index: number; total: number; node: Omit<ExportedNode, 'bytes'>; bytes: Uint8Array }
  | { type: 'EXPORT_DONE'; total: number }
  | { type: 'EXPORT_ERROR'; message: string }
  | { type: 'KV_EXPORT_RESULT'; node: Omit<ExportedNode, 'bytes'>; bytes: Uint8Array; kv: unknown }
  | { type: 'KV_EXPORT_ERROR'; message: string }
  | { type: 'CRAWL_START'; totalAssets: number; totalPages: number }
  | { type: 'CRAWL_ASSET'; index: number; total: number; asset: Omit<CrawledAsset, 'bytes'>; bytes: Uint8Array }
  | { type: 'CRAWL_DONE'; totalAssets: number }
  | { type: 'CRAWL_ERROR'; message: string }
  | { type: 'WRITE_AVATARFRAME_DONE'; frameNodeId: string }
  | { type: 'WRITE_AVATARFRAME_ERROR'; message: string };

type AssetKey = 'kv' | 'h5' | 'banner1029x276' | 'banner750x500' | 'avatarFrame' | 'icons';

type CrawledAsset = {
  nodeId: string;
  name: string;
  pageName: string;
  width: number;
  height: number;
  assetKey: AssetKey;
  title: string;
  region: string;
  level: string;
  figmaUrl?: string;
  bytes: Uint8Array;
};

declare const __UI_HTML__: string;

try {
  figma.showUI(__UI_HTML__, { width: 420, height: 640 });
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  figma.notify(`UI 启动失败: ${message}`);
}

function getExportCandidates(mode: ExportMode): readonly SceneNode[] {
  if (mode === 'selection') {
    return figma.currentPage.selection;
  }
  const nodes: SceneNode[] = [];
  for (const child of figma.currentPage.children) {
    if (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE' || child.type === 'GROUP') {
      nodes.push(child);
    }
  }
  return nodes;
}

function isFrameLike(node: SceneNode): node is FrameLikeNode {
  return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP';
}

/** 任意可 exportAsync(PNG) 的图层均可作为 KV 源，不限制比例与是否 Frame */
function isKvExportRoot(node: SceneNode): boolean {
  const ex = node as unknown as { exportAsync?: (s: ExportSettings) => Promise<Uint8Array> };
  return typeof ex.exportAsync === 'function';
}

function buildKvSpec(root: SceneNode) {
  const out: KvNode[] = [];
  const rootPos = root as unknown as { x?: number; y?: number; width?: number; height?: number };
  const rx = rootPos.x ?? 0;
  const ry = rootPos.y ?? 0;

  const walk = (node: SceneNode) => {
    const pos = node as unknown as { x?: number; y?: number; width?: number; height?: number; rotation?: number; opacity?: number; visible?: boolean };
    if (pos.visible === false) return;
    const item: KvNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: Math.round((pos.x ?? 0) - rx),
      y: Math.round((pos.y ?? 0) - ry),
      width: Math.round(pos.width ?? 0),
      height: Math.round(pos.height ?? 0),
      rotation: Math.round((pos.rotation ?? 0) * 1000) / 1000,
      opacity: Math.round((pos.opacity ?? 1) * 1000) / 1000,
    };

    if (node.type === 'TEXT') {
      const tn = node as TextNode;
      item.text = {
        characters: String(tn.characters || '').slice(0, 200),
        fontSize: tn.fontSize,
        textAlignHorizontal: tn.textAlignHorizontal,
        textAlignVertical: tn.textAlignVertical,
      };
    }

    out.push(item);

    if ('children' in node) {
      const children = (node as unknown as { children?: readonly SceneNode[] }).children;
      if (children && children.length) {
        for (let i = 0; i < children.length; i++) walk(children[i]);
      }
    }
  };

  walk(root);
  return {
    root: {
      id: root.id,
      name: root.name,
      type: root.type,
      width: Math.round(rootPos.width ?? 0),
      height: Math.round(rootPos.height ?? 0),
    },
    nodes: out,
  };
}

async function exportKvFromSelection(scale: number) {
  const selection = figma.currentPage.selection;
  if (!selection || selection.length !== 1) {
    figma.ui.postMessage({ type: 'KV_EXPORT_ERROR', message: '请选择一个图层（仅支持单选）' } satisfies PluginResponse);
    return;
  }

  const node = selection[0];
  if (!isKvExportRoot(node)) {
    figma.ui.postMessage({
      type: 'KV_EXPORT_ERROR',
      message: '当前选中节点无法导出为 PNG，请选 Frame、编组、组件实例、形状、矢量、图片、文本等可导出图层',
    } satisfies PluginResponse);
    return;
  }

  const bytes = await node.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: Math.max(0.1, Math.min(4, scale || 2)) },
  });

  const parent = node.parent;
  const page = parent && parent.type === 'PAGE' ? parent : figma.currentPage;
  const kv = buildKvSpec(node);

  figma.ui.postMessage({
    type: 'KV_EXPORT_RESULT',
    node: {
      id: node.id,
      name: node.name,
      pageName: page.name,
      width: node.width,
      height: node.height,
    },
    bytes,
    kv,
  } satisfies PluginResponse);
}

function safeAppend(parent: BaseNode & ChildrenMixin, child: SceneNode) {
  try {
    parent.appendChild(child);
    return;
  } catch (e) {
    void e;
  }
  try {
    parent.insertChild(parent.children.length, child);
  } catch (e) {
    void e;
  }
}

function setImageFill(node: GeometryMixin, bytes: Uint8Array) {
  const img = figma.createImage(bytes);
  const paint: ImagePaint = {
    type: 'IMAGE',
    imageHash: img.hash,
    scaleMode: 'FIT',
  };
  node.fills = [paint];
}

function createAvatarFrame(spec: {
  frameName: string;
  frameSize: number;
  elementNames: { element1: string; element2: string; element3: string };
  images: { element1Png: Uint8Array; element2Png: Uint8Array; element3Png?: Uint8Array };
  anchorNode: SceneNode | null;
  boxes?: {
    element1: { x: number; y: number; width: number; height: number };
    element2: { x: number; y: number; width: number; height: number };
    element3?: { x: number; y: number; width: number; height: number } | null;
  };
}) {
  const size = Math.max(1, Math.round(spec.frameSize));
  const frame = figma.createFrame();
  frame.resize(size, size);
  frame.name = spec.frameName;
  frame.fills = [];
  frame.clipsContent = false;

  const GAP = 48;
  if (spec.anchorNode) {
    const a = spec.anchorNode as unknown as { x?: number; y?: number; width?: number };
    frame.x = Math.round((a.x ?? 0) + (a.width ?? 0) + GAP);
    frame.y = Math.round(a.y ?? 0);
  }

  const bx = spec.boxes;
  const b1 = bx?.element1 ?? { x: 87, y: 171, width: 96, height: 96 };
  const b2 = bx?.element2 ?? { x: 15, y: 171, width: 240, height: 96 };
  const b3 = bx?.element3;

  // 子图层顺序 = 从下到上：环绕 -> 主元素 -> 顶部（最顶层）
  const element2 = figma.createRectangle();
  element2.name = spec.elementNames.element2;
  element2.x = b2.x;
  element2.y = b2.y;
  element2.resize(Math.max(1, b2.width), Math.max(1, b2.height));
  setImageFill(element2, spec.images.element2Png);
  safeAppend(frame, element2);

  const element1 = figma.createRectangle();
  element1.name = spec.elementNames.element1;
  element1.x = b1.x;
  element1.y = b1.y;
  element1.resize(Math.max(1, b1.width), Math.max(1, b1.height));
  setImageFill(element1, spec.images.element1Png);
  safeAppend(frame, element1);

  const hasTop =
    b3 &&
    b3.width >= 1 &&
    b3.height >= 1 &&
    spec.images.element3Png &&
    spec.images.element3Png.byteLength > 0;
  if (hasTop && b3) {
    const element3 = figma.createRectangle();
    element3.name = spec.elementNames.element3;
    element3.x = b3.x;
    element3.y = b3.y;
    element3.resize(Math.max(1, b3.width), Math.max(1, b3.height));
    setImageFill(element3, spec.images.element3Png as Uint8Array);
    safeAppend(frame, element3);
  }

  return frame;
}

const T = 15;
const KV_PAIRS: Array<[number, number]> = [[750, 500], [750, 750], [750, 900]];
function classifyBySize(width: number, height: number): AssetKey | null {
  const w = Math.round(width);
  const h = Math.round(height);
  for (let i = 0; i < KV_PAIRS.length; i++) {
    const pair = KV_PAIRS[i];
    if (Math.abs(w - pair[0]) <= T && Math.abs(h - pair[1]) <= T) return 'kv';
  }
  if (Math.abs(w - 1029) <= T && Math.abs(h - 276) <= T) return 'banner1029x276';
  const ratio = w / Math.max(1, h);
  const near750x200 = w >= 700 && w <= 820 && h >= 170 && h <= 240 && ratio >= 3.0 && ratio <= 4.8;
  if ((Math.abs(w - 750) <= T && Math.abs(h - 200) <= T) || near750x200) return 'banner750x500';
  if (Math.abs(w - 270) <= 20 && Math.abs(h - 270) <= 20) return 'avatarFrame';
  if (Math.abs(w - 750) <= T && h >= 2000) return 'h5';
  if (w >= 24 && w <= 512 && h >= 24 && h <= 512 && Math.abs(w - h) <= T * 2) return 'icons';
  return null;
}

function shouldSkipPage(name: string) {
  const n = String(name || '').toLowerCase();
  const patterns = ['✈', '草稿', '参考', 'reference', 'refer', 'ref', 'draft', 'wip', 'sample', '示例', 'temp', 'tmp'];
  for (let i = 0; i < patterns.length; i++) {
    if (n.indexOf(patterns[i]) >= 0) return true;
  }
  return false;
}

function parsePageNameParts(name: string) {
  const KNOWN_LEVELS = ['TOP', 'MATURE', 'MID', 'LOW'];
  const KNOWN_REGIONS = ['GLOBAL', 'SEA', 'NEA', 'EU', 'MENA', 'LATAM', 'US', 'ANZ', 'CN'];
  const parts = String(name || '').split(/[_\-\s]+/);
  let level = '';
  let region = '';
  const titleParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const upper = String(part || '').toUpperCase();
    if (level === '' && KNOWN_LEVELS.indexOf(upper) >= 0) level = upper;
    else if (region === '' && KNOWN_REGIONS.indexOf(upper) >= 0) region = upper;
    else if (part) titleParts.push(part);
  }
  return { level, region, title: titleParts.join(' ') };
}

function parseRegionFromTitle(title: string) {
  const m = String(title || '').trim().match(/-\s*([A-Za-z]{2,5})\s*$/);
  return m ? m[1].toUpperCase() : '';
}

function crawlCurrentFile(scale: number) {
  void scale;
  const pages = figma.root.children;
  const crawled: Array<{ page: PageNode; title: string; region: string; level: string; assets: FrameLikeNode[] }> = [];

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    if (shouldSkipPage(page.name)) continue;
    const parsed = parsePageNameParts(page.name);
    const title = parsed.title || page.name;
    const titleRegion = parseRegionFromTitle(title);
    const region = parsed.region || titleRegion || 'GLOBAL';
    const level = parsed.level || 'TOP';

    const assets: FrameLikeNode[] = [];
    const walk = (node: SceneNode) => {
      if (node.visible === false) return;
      if (isFrameLike(node)) {
        const key = classifyBySize(node.width, node.height);
        if (key) assets.push(node);
      }
      if ('children' in node) {
        const children = (node as unknown as { children?: readonly SceneNode[] }).children;
        if (children && children.length) {
          for (let i = 0; i < children.length; i++) walk(children[i]);
        }
      }
    };

    for (let i = 0; i < page.children.length; i++) {
      walk(page.children[i]);
    }

    const hasKv = assets.some(a => classifyBySize(a.width, a.height) === 'kv');
    if (!hasKv) continue;

    crawled.push({ page, title, region, level, assets });
  }

  return crawled;
}

async function exportNodes(mode: ExportMode, scale: number) {
  const candidates = getExportCandidates(mode);
  if (!candidates || candidates.length === 0) {
    const msg: PluginResponse = { type: 'EXPORT_ERROR', message: mode === 'selection' ? '未选中任何节点' : '当前页没有可导出的顶层节点' };
    figma.ui.postMessage(msg);
    return;
  }

  const exportable = candidates.filter(n => typeof (n as unknown as { exportAsync?: unknown }).exportAsync === 'function');
  if (exportable.length === 0) {
    const msg: PluginResponse = { type: 'EXPORT_ERROR', message: '选区中没有可导出的节点（需为 Frame/Component/Instance 等）' };
    figma.ui.postMessage(msg);
    return;
  }

  figma.ui.postMessage({ type: 'EXPORT_START', total: exportable.length } satisfies PluginResponse);

  for (let i = 0; i < exportable.length; i++) {
    const node = exportable[i];
    const parent = node.parent;
    const page = parent && parent.type === 'PAGE' ? parent : figma.currentPage;
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: Math.max(0.1, Math.min(4, scale || 2)) }
    });

    const payload: PluginResponse = {
      type: 'EXPORT_ITEM',
      index: i,
      total: exportable.length,
      node: {
        id: node.id,
        name: node.name,
        pageName: page.name,
        width: node.width,
        height: node.height,
      },
      bytes,
    };
    figma.ui.postMessage(payload);
  }

  figma.ui.postMessage({ type: 'EXPORT_DONE', total: exportable.length } satisfies PluginResponse);
}

figma.ui.onmessage = async (msg: PluginRequest) => {
  try {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
    if (msg.type === 'PING') {
      figma.ui.postMessage({ type: 'PONG', fileKey: figma.fileKey } satisfies PluginResponse);
      return;
    }
    if (msg.type === 'EXPORT_NODES') {
      await exportNodes(msg.mode, msg.scale);
      return;
    }
    if (msg.type === 'EXPORT_KV_FROM_SELECTION') {
      await exportKvFromSelection(msg.scale);
      return;
    }
    if (msg.type === 'WRITE_AVATARFRAME_TO_CANVAS') {
      const selection = figma.currentPage.selection;
      let anchor: SceneNode | null = null;
      if (msg.anchorNodeId) {
        try {
          const n = figma.getNodeById(msg.anchorNodeId);
          if (n && n.type !== 'DOCUMENT' && n.type !== 'PAGE') anchor = n as SceneNode;
        } catch {
          anchor = null;
        }
      }
      if (!anchor && selection && selection.length === 1) anchor = selection[0];
      const parentNode = anchor?.parent;
      const parent = (parentNode && 'appendChild' in parentNode ? (parentNode as BaseNode & ChildrenMixin) : figma.currentPage) as BaseNode & ChildrenMixin;
      const names = msg.names || {};

      const frame = createAvatarFrame({
        frameName: names.frame || 'AvatarFrame',
        frameSize: msg.frameSize,
        elementNames: {
          element1: names.element1 || '主元素',
          element2: names.element2 || '环绕元素',
          element3: names.element3 || '顶部元素',
        },
        images: msg.images,
        anchorNode: anchor,
        boxes: msg.boxes,
      });

      safeAppend(parent, frame);
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);
      figma.ui.postMessage({ type: 'WRITE_AVATARFRAME_DONE', frameNodeId: frame.id } satisfies PluginResponse);
      return;
    }
    if (msg.type === 'CRAWL_FILE') {
      const scale = Math.max(0.1, Math.min(4, msg.scale || 2));
      const crawled = crawlCurrentFile(scale);
      let totalAssets = 0;
      for (let i = 0; i < crawled.length; i++) totalAssets += crawled[i].assets.length;
      figma.ui.postMessage({ type: 'CRAWL_START', totalAssets, totalPages: crawled.length } satisfies PluginResponse);

      let emitted = 0;
      for (let ci = 0; ci < crawled.length; ci++) {
        const c = crawled[ci];
        for (let ai = 0; ai < c.assets.length; ai++) {
          const node = c.assets[ai];
          const assetKey = classifyBySize(node.width, node.height) as AssetKey | null;
          if (!assetKey) continue;

          const bytes = await node.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: scale },
          });

          const payload: PluginResponse = {
            type: 'CRAWL_ASSET',
            index: emitted,
            total: totalAssets,
            asset: {
              nodeId: node.id,
              name: node.name,
              pageName: c.page.name,
              width: node.width,
              height: node.height,
              assetKey,
              title: c.title,
              region: c.region,
              level: c.level,
              figmaUrl: figma.fileKey ? `https://www.figma.com/file/${figma.fileKey}` : undefined,
            },
            bytes,
          };

          figma.ui.postMessage(payload);
          emitted++;
        }
      }

      figma.ui.postMessage({ type: 'CRAWL_DONE', totalAssets: emitted } satisfies PluginResponse);
      return;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const t = typeof (msg as unknown as { type?: unknown })?.type === 'string' ? String((msg as unknown as { type?: unknown }).type) : '';
    if (t === 'CRAWL_FILE') {
      figma.ui.postMessage({ type: 'CRAWL_ERROR', message } satisfies PluginResponse);
      return;
    }
    if (t === 'EXPORT_KV_FROM_SELECTION') {
      figma.ui.postMessage({ type: 'KV_EXPORT_ERROR', message } satisfies PluginResponse);
      return;
    }
    if (t === 'WRITE_AVATARFRAME_TO_CANVAS') {
      figma.ui.postMessage({ type: 'WRITE_AVATARFRAME_ERROR', message } satisfies PluginResponse);
      return;
    }
    figma.ui.postMessage({ type: 'EXPORT_ERROR', message } satisfies PluginResponse);
  }
};

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const multer = require('multer');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch {}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const PNG = require('pngjs').PNG;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({ 
  storage, 
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB file size
    fieldSize: 10 * 1024 * 1024  // 10MB JSON body size
  } 
});

const dbPath = path.join(__dirname, 'db.json');

// 显式取消：仅当用户点击「停止」时生效，避免 req.on('close') 误触发
const crawlCancelMap = new Map(); // sessionId -> true

const readDB = () => {
  const data = fs.readFileSync(dbPath, 'utf8');
  return JSON.parse(data);
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

function pickTagsHeuristic(input = {}, tagOptions = {}) {
  const text = `${input.title || ''} ${input.pageName || ''} ${input.fileName || ''} ${input.designer || ''}`.toLowerCase();
  const out = {};
  for (const [key, options] of Object.entries(tagOptions || {})) {
    if (!Array.isArray(options) || options.length === 0) continue;
    const hit = options.find(opt => String(opt || '').toLowerCase() && text.includes(String(opt).toLowerCase()));
    if (hit) out[key] = hit;
  }
  return out;
}

function normalizeAutoTaggedCategories(categories = {}) {
  const allow = new Set(['theme', 'style', 'colorTone', 'vibe', 'element', 'size', 'collaboration']);
  const out = {};
  for (const [k, v] of Object.entries(categories || {})) {
    if (!allow.has(k)) continue;
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

function parseRegionFromTitle(title = '') {
  const t = String(title || '').trim();
  const m = t.match(/-\s*([A-Za-z]{2,5})\s*$/);
  if (!m) return '';
  return m[1].toUpperCase();
}

function getPngDimensions(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const png = PNG.sync.read(buf);
    if (!png || !png.width || !png.height) return null;
    return { width: png.width, height: png.height };
  } catch {
    return null;
  }
}

function pickClosestNumericOption(value, options = []) {
  const nums = (options || []).map(v => ({ raw: String(v), n: Number(String(v).trim()) })).filter(o => Number.isFinite(o.n));
  if (nums.length === 0 || !Number.isFinite(value)) return '';
  let best = nums[0];
  let bestDiff = Math.abs(nums[0].n - value);
  for (const o of nums.slice(1)) {
    const d = Math.abs(o.n - value);
    if (d < bestDiff) {
      best = o;
      bestDiff = d;
    }
  }
  return best.raw;
}

function fillCategoriesFromHeuristics(categories, ctx, tagOptions) {
  const out = { ...(categories || {}) };
  const title = String(ctx?.title || '').toLowerCase();
  const pageName = String(ctx?.pageName || '').toLowerCase();
  const fileName = String(ctx?.fileName || '').toLowerCase();
  const kvName = String(ctx?.kvFrameName || '').toLowerCase();
  const joined = `${title} ${pageName} ${fileName} ${kvName}`;

  if (!out.size) {
    const dims = ctx?.kvDims;
    if (dims && tagOptions?.size) {
      const basis = Math.max(dims.width || 0, dims.height || 0);
      out.size = pickClosestNumericOption(basis, tagOptions.size);
    }
  }

  if (!out.style && Array.isArray(tagOptions?.style)) {
    const hit = tagOptions.style.find(opt => opt && joined.includes(String(opt).toLowerCase()));
    if (hit) out.style = hit;
  }

  if (!out.collaboration && Array.isArray(tagOptions?.collaboration)) {
    const collabSignals = ['联名', '合作', 'collab', 'collaboration', ' x ', '×', '&', 'with'];
    const hasSignal = collabSignals.some(s => joined.includes(s));
    if (hasSignal) {
      const opt = tagOptions.collaboration.find(v => String(v).toLowerCase().includes('collaborate'));
      if (opt) out.collaboration = opt;
    }
  }

  return out;
}

function normalizeEnvString(v) {
  if (v == null) return '';
  return String(v).trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
}

function tryParseJsonObject(text) {
  if (!text) return null;
  let raw = String(text).trim();
  raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj;
  } catch {}
  const l = raw.indexOf('{');
  const r = raw.lastIndexOf('}');
  if (l >= 0 && r > l) {
    const slice = raw.slice(l, r + 1);
    try {
      const obj = JSON.parse(slice);
      if (obj && typeof obj === 'object') return obj;
    } catch {}
  }
  return null;
}

function formatTagOptionsForPrompt(tagOptions = {}) {
  const lines = [];
  for (const [k, arr] of Object.entries(tagOptions || {})) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    lines.push(`${k}: ${arr.map(v => JSON.stringify(v)).join(', ')}`);
  }
  return lines.join('\n');
}

function getViviaiConfig() {
  const apiKey = normalizeEnvString(process.env.VIVIAI_API_KEY || process.env.API_KEY || '');
  const baseUrl = normalizeEnvString(process.env.VIVIAI_BASE_URL || process.env.API_BASE_URL || '');
  const model = normalizeEnvString(process.env.VIVIAI_MODEL || process.env.MODEL_ID || '');
  const fallbackModels = normalizeEnvString(process.env.VIVIAI_FALLBACK_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  const timeoutMs = Number(process.env.VIVIAI_TIMEOUT_MS || '30000');
  const imageTimeoutMs = Number(process.env.VIVIAI_IMAGE_TIMEOUT_MS || '45000');
  const retries = Number(process.env.VIVIAI_RETRIES || '2');
  const resolvedBaseUrl = (baseUrl || (apiKey ? 'https://api.viviai.cc' : '')).replace(/\/+$/g, '');
  return {
    apiKey,
    baseUrl: resolvedBaseUrl,
    model: model || 'gemini-3-pro-preview',
    fallbackModels,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000,
    imageTimeoutMs: Number.isFinite(imageTimeoutMs) && imageTimeoutMs > 0 ? imageTimeoutMs : 45000,
    retries: Number.isFinite(retries) && retries >= 0 ? retries : 2,
  };
}

function parseViviaiError(rawText = '') {
  const obj = tryParseJsonObject(rawText);
  const err = obj?.error;
  if (!err || typeof err !== 'object') return null;
  const code = typeof err.code === 'string' ? err.code : '';
  const message = typeof err.message === 'string' ? err.message : '';
  return { code, message };
}

async function autoTagCampaign(input = {}, tagOptions = {}) {
  const url = process.env.AUTO_TAG_API_URL;
  if (url) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const key = process.env.AUTO_TAG_API_KEY;
      if (key) headers.Authorization = `Bearer ${key}`;
      const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input, tagOptions }),
      }, 8000);
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        return { categories: pickTagsHeuristic(input, tagOptions), source: 'heuristic', error: `custom_api_http_${resp.status}`, raw: t.slice(0, 800) };
      }
      const data = await resp.json().catch(() => null);
      if (data && typeof data === 'object' && data.categories && typeof data.categories === 'object') {
        return { categories: data.categories, source: 'custom_api' };
      }
      return { categories: pickTagsHeuristic(input, tagOptions), source: 'heuristic', error: 'custom_api_invalid_json' };
    } catch {
      return { categories: pickTagsHeuristic(input, tagOptions), source: 'heuristic' };
    }
  }

  const viv = getViviaiConfig();
  if (!viv.apiKey || !viv.baseUrl) return { categories: pickTagsHeuristic(input, tagOptions), source: 'heuristic', error: 'missing_viviai_config' };

  try {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${viv.apiKey}` };
    const endpoint = `${viv.baseUrl}/v1/chat/completions`;

    const system = {
      role: 'system',
      content: 'You are a tagging assistant. You must choose tag values ONLY from the provided options. Output ONLY JSON (no markdown, no extra text).',
    };

    const promptText = [
      'Task: Auto-tag this campaign based on title (and KV image if provided).',
      'Rules:',
      '- Choose ONLY from the provided options per category.',
      '- For each category: pick ONE value from options, or output empty string if truly unknown.',
      '- IMPORTANT: Do NOT output ipCampaign. IP activity is manual and not auto-tagged.',
      '- Collaboration rule: if KV contains a partner/brand logo lockup (multiple brand marks/logos in header like TikTok LIVE + other event/logo), set collaboration to "collaborate"; otherwise "Non collaborate" or empty.',
      '- Element rule: only set element to "Character" when there are obvious characters/mascots/people as main visual. Logo-only or abstract graphics should NOT be Character.',
      '- Output JSON ONLY with schema: {"categories": {"theme":"","style":"","colorTone":"","vibe":"","element":"","size":"","collaboration":""}}',
      '',
      `Campaign title: ${input.title || ''}`,
      '',
      'Allowed options:',
      formatTagOptionsForPrompt(tagOptions),
    ].join('\n');

    const kvUrl = normalizeEnvString(input.kvUrl || '');

    const buildBody = (modelId, useImage) => {
      const user = useImage && kvUrl
        ? { role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', image_url: { url: kvUrl } }] }
        : { role: 'user', content: promptText };

      return {
        model: modelId,
        temperature: 0.2,
        messages: [system, user],
      };
    };

    const candidateModels = [viv.model, ...(viv.fallbackModels || [])].filter(Boolean);
    let lastError = null;

    for (const modelId of candidateModels) {
      for (const mode of (kvUrl ? ['image', 'text'] : ['text'])) {
        const usedImage = mode === 'image';
        const timeoutMs = usedImage ? viv.imageTimeoutMs : viv.timeoutMs;

        for (let attempt = 0; attempt <= viv.retries; attempt++) {
          let resp;
          try {
            resp = await fetchWithTimeout(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(buildBody(modelId, usedImage)),
            }, timeoutMs);
          } catch (e) {
            const raw = String(e?.stack || e?.message || e || '').slice(0, 800);
            lastError = { error: attempt === viv.retries ? 'viviai_exception' : 'viviai_retrying', raw, modelId, usedImage };
            if (attempt < viv.retries) {
              const waitMs = 600 + attempt * 900;
              await new Promise(r => setTimeout(r, waitMs));
              continue;
            }
            continue;
          }

          if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            const parsedErr = parseViviaiError(t);
            const code = parsedErr?.code || '';
            const errTag = `viviai_http_${resp.status}${usedImage ? '_image' : '_text'}`;
            lastError = { error: errTag, raw: t.slice(0, 800), modelId, usedImage, code };

            const retryable = resp.status === 503 || resp.status === 429 || resp.status >= 500;
            const modelNotFound = code === 'model_not_found';

            if (modelNotFound) break;
            if (retryable && attempt < viv.retries) {
              const waitMs = 600 + attempt * 900;
              await new Promise(r => setTimeout(r, waitMs));
              continue;
            }
            continue;
          }

          const data = await resp.json().catch(() => null);
          const content = data?.choices?.[0]?.message?.content;
          const parsed = tryParseJsonObject(content);
          if (parsed && parsed.categories && typeof parsed.categories === 'object') {
            return { categories: parsed.categories, source: 'viviai', model: modelId, usedImage };
          }

          lastError = { error: `viviai_parse_failed${usedImage ? '_image' : '_text'}`, raw: String(content || '').slice(0, 800), modelId, usedImage };
          break;
        }
      }
    }

    return {
      categories: pickTagsHeuristic(input, tagOptions),
      source: 'viviai',
      error: lastError?.error || 'viviai_failed',
      raw: lastError?.raw,
      model: lastError?.modelId,
      usedImage: lastError?.usedImage,
    };
  } catch (e) {
    const msg = String(e?.stack || e?.message || e || '').slice(0, 800);
    return { categories: pickTagsHeuristic(input, tagOptions), source: 'viviai', error: 'viviai_exception', raw: msg };
  }
}

// GET /api/local-file?path=...
app.get('/api/local-file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).send('Missing path');
  }
  // Optional: Security check to ensure it's within allowed directories
  // For now, we allow it as a local tool helper
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(path.resolve(filePath));
});

app.get('/api/tagger-status', (_req, res) => {
  const viv = getViviaiConfig();
  res.json({
    enabled: !!(viv.apiKey && viv.baseUrl),
    baseUrl: viv.baseUrl,
    model: viv.model,
    fallbackModels: viv.fallbackModels,
    timeoutMs: viv.timeoutMs,
    imageTimeoutMs: viv.imageTimeoutMs,
    retries: viv.retries,
    hasKey: !!viv.apiKey,
    hasAutoTagApi: !!normalizeEnvString(process.env.AUTO_TAG_API_URL || ''),
  });
});

// POST /api/upload — Upload one or more image files, returns array of URLs
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  try {
    const urls = (req.files || []).map(f => `http://localhost:${PORT}/uploads/${f.filename}`);
    res.json({ urls });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// GET settings
app.get('/api/settings', (req, res) => {
  try {
    const db = readDB();
    res.json(db.settings || { displayTags: {} });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// PUT settings
app.put('/api/settings', (req, res) => {
  try {
    const db = readDB();
    db.settings = { ...db.settings, ...req.body };
    writeDB(db);
    res.json(db.settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET tag options
app.get('/api/tag-options', (req, res) => {
  try {
    const db = readDB();
    res.json(db.tagOptions || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to read tag options' });
  }
});

// PUT add a new option to a tag category
app.put('/api/tag-options/:category', (req, res) => {
  try {
    const db = readDB();
    const { category } = req.params;
    const { value } = req.body;
    if (!db.tagOptions) db.tagOptions = {};
    if (!db.tagOptions[category]) db.tagOptions[category] = [];
    if (!db.tagOptions[category].includes(value)) {
      db.tagOptions[category].push(value);
      writeDB(db);
    }
    res.json(db.tagOptions[category]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tag options' });
  }
});

// POST /api/figma-sync — Crawl Figma file for top-level frames
app.post('/api/figma-sync', async (req, res) => {
  try {
    const { figmaUrl, token } = req.body;
    if (!figmaUrl || !token) {
      return res.status(400).json({ error: 'figmaUrl and token are required' });
    }

    // Extract fileKey from URL (supports /file/xxx and /design/xxx)
    const match = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid Figma URL. Expected format: figma.com/file/xxx or figma.com/design/xxx' });
    }
    const fileKey = match[1];

    const headers = { 'X-Figma-Token': token };

    // Step 1: Get file structure
    const fileRes = await fetch(`https://api.figma.com/v1/files/${fileKey}`, { headers });
    if (!fileRes.ok) {
      const errText = await fileRes.text();
      return res.status(fileRes.status).json({ error: `Figma API error: ${errText}` });
    }
    const fileData = await fileRes.json();

    // Step 2: Collect top-level frames from all pages
    const KNOWN_LEVELS = ['TOP', 'MATURE', 'MID', 'LOW'];
    const KNOWN_REGIONS = ['GLOBAL', 'SEA', 'NEA', 'EU', 'MENA', 'LATAM', 'US', 'ANZ', 'CN'];
    const topFrames = [];

    for (const page of fileData.document.children) {
      if (!page.children) continue;
      for (const node of page.children) {
        if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
          // Parse naming convention: e.g. "TOP_SEA_GingerbreadHouse_KV"
          const parts = node.name.split(/[_\-\s]+/);
          let parsedLevel = '';
          let parsedRegion = '';
          const titleParts = [];

          for (const part of parts) {
            const upper = part.toUpperCase();
            if (KNOWN_LEVELS.includes(upper) && !parsedLevel) {
              parsedLevel = upper;
            } else if (KNOWN_REGIONS.includes(upper) && !parsedRegion) {
              parsedRegion = upper;
            } else if (upper !== 'KV') {
              titleParts.push(part);
            }
          }

          topFrames.push({
            nodeId: node.id,
            name: node.name,
            pageName: page.name,
            parsedLevel,
            parsedRegion,
            parsedTitle: titleParts.join(' ') || node.name,
          });
        }
      }
    }

    if (topFrames.length === 0) {
      return res.json({ frames: [], message: 'No top-level frames found in this file.' });
    }

    // Step 3: Export images for all frames (batch, max ~50 at a time)
    const nodeIds = topFrames.map(f => f.nodeId).join(',');
    const imgRes = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds)}&format=png&scale=2`,
      { headers }
    );
    if (!imgRes.ok) {
      const errText = await imgRes.text();
      return res.status(imgRes.status).json({ error: `Figma image export error: ${errText}` });
    }
    const imgData = await imgRes.json();

    // Step 4: Merge image URLs into frame data
    const frames = topFrames.map(f => ({
      ...f,
      imageUrl: (imgData.images && imgData.images[f.nodeId]) || '',
      figmaNodeUrl: `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(f.nodeId)}`,
    }));

    res.json({ frames, fileName: fileData.name });
  } catch (error) {
    console.error('Figma sync error:', error);
    res.status(500).json({ error: 'Failed to sync with Figma: ' + error.message });
  }
});

// GET all KVs — pass ?published=true to filter for frontend
app.get('/api/kvs', (req, res) => {
  try {
    const db = readDB();
    let kvs = db.kvs;
    if (req.query.published === 'true') {
      kvs = kvs.filter(k => k.published !== false);
    }
    res.json(kvs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// GET a single KV by id
app.get('/api/kvs/:id', (req, res) => {
  try {
    const db = readDB();
    const kv = db.kvs.find(k => k.id === req.params.id);
    if (kv) {
      res.json(kv);
    } else {
      res.status(404).json({ error: 'KV not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// POST /api/batch-import — Batch import KVs from JSON + image files
// Expects multipart: field "manifest" (JSON string) + files under "images"
// manifest format: { items: [{ ...kvFields, imageFileName: "xxx.png", images: { kv: ["a.png","b.png"], ... } }] }
app.post('/api/batch-import', upload.array('images', 200), (req, res) => {
  try {
    const manifest = JSON.parse(req.body.manifest || '{}');
    const items = manifest.items || [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'No items in manifest' });
    }

    const fileMap = {};
    (req.files || []).forEach(f => { fileMap[f.originalname] = `http://localhost:${PORT}/uploads/${f.filename}`; });

    const db = readDB();
    const imported = [];

    for (const item of items) {
      const resolveUrl = (name) => fileMap[name] || name || '';
      const mainImage = resolveUrl(item.imageFileName) || '';

      const resolveImageArray = (arr) =>
        (arr || []).map(name => ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,7), url: resolveUrl(name) }));

      const resolveAvatarArray = (arr) =>
        (arr || []).map(a => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,7),
          url: resolveUrl(a.fileName || a.url || ''),
          type: a.type || 'Creator',
          level: a.level || 'LV1'
        }));

      const images = item.images ? {
        kv: resolveImageArray(item.images.kv),
        h5: resolveImageArray(item.images.h5),
        banner1029x276: resolveImageArray(item.images.banner1029x276),
        banner750x500: resolveImageArray(item.images.banner750x500),
        avatarFrame: resolveAvatarArray(item.images.avatarFrame),
        icons: resolveImageArray(item.images.icons),
      } : undefined;

      const kv = {
        id: Date.now().toString() + Math.random().toString(36).slice(2,5),
        published: item.published ?? false,
        title: item.title || '',
        date: item.date || new Date().toISOString().slice(0,10),
        region: item.region || 'GLOBAL',
        level: item.level || 'TOP',
        imageUrl: mainImage || (images?.kv?.[0]?.url) || '',
        isIP: item.isIP || false,
        type: item.type || 'Key Visual',
        gameplay: item.gameplay || '',
        figmaUrl: item.figmaUrl || '',
        categories: item.categories || {},
        ...(images ? { images } : {}),
      };

      db.kvs.unshift(kv);
      imported.push({ id: kv.id, title: kv.title });
    }

    writeDB(db);
    res.json({ imported: imported.length, items: imported });
  } catch (error) {
    console.error('Batch import error:', error);
    res.status(500).json({ error: 'Batch import failed: ' + error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// ── Figma Crawl Engine v3 — Section Discovery + Spatial Analysis ──
// ══════════════════════════════════════════════════════════════════════
//
// 针对 KV 交付模板的结构:
//   Page (一个活动)
//     └─ Main Frame
//          ├─ Header (标题/设计师/日期)
//          ├─ Customized Page → 识别为 h5
//          ├─ Configuration Items
//          │    ├─ "KV Background" 区块 → kv
//          │    ├─ "H5" 区块 → h5
//          │    ├─ "Banner" 区块 → 按实际尺寸分 banner1029x276 / banner750x500
//          │    └─ "Avatar Frame" 区块 → avatarFrame (含空间分析: 主播/观众, S/M/L)
//          ├─ Characters (跳过)
//          └─ Video frames (跳过)
//

// ── 仅按尺寸识别（1 倍），忽略 Frame 命名 ──
const T = 15; // 尺寸容差 px
const KV_PAIRS = [[750, 500], [750, 750], [750, 900]];
const SIZE_RULES = [
  { type: 'kv', match: (w, h) => KV_PAIRS.some(([x, y]) => Math.abs(w - x) <= T && Math.abs(h - y) <= T) },
  { type: 'banner1029x276', match: (w, h) => Math.abs(w - 1029) <= T && Math.abs(h - 276) <= T },
  // 为了兼容现有数据结构字段名，仍使用 banner750x500 这个 key
  // 第二种 Banner 仅认 750×200（含比例兜底）
  { type: 'banner750x500', match: (w, h) => {
    const exact = Math.abs(w - 750) <= T && Math.abs(h - 200) <= T;
    const ratio = w / h;
    const near750x200 = w >= 700 && w <= 820 && h >= 170 && h <= 240 && ratio >= 3.0 && ratio <= 4.8;
    return exact || near750x200;
  }},
  // 头像框：按 270×270 抓取（允许少量误差）
  { type: 'avatarFrame', match: (w, h) => Math.abs(w - 270) <= 20 && Math.abs(h - 270) <= 20 },
  { type: 'h5', match: (w, h) => Math.abs(w - 750) <= T && h >= 2000 }, // Updated: h >= 2000
  { type: 'icons', match: (w, h) => w >= 24 && w <= 512 && h >= 24 && h <= 512 && Math.abs(w - h) <= T * 2 },
];

function classifyBySize(width, height) {
  for (const rule of SIZE_RULES) {
    if (rule.match(width, height)) return rule.type;
  }
  return null;
}

// ── 从本地 git-assets 导入（与 Figma 爬取输出目录结构一致）────────────────

const KNOWN_CMS_REGIONS = new Set(['GLOBAL', 'US', 'EU', 'SEA', 'NEA', 'CN', 'LATAM', 'MENA', 'ANZ']);

function normalizeCmsRegion(r) {
  const u = String(r || '').trim().toUpperCase();
  if (!u) return 'GLOBAL';
  if (KNOWN_CMS_REGIONS.has(u)) return u;
  if (['MY', 'TH', 'PH', 'VN', 'ID', 'SG'].includes(u)) return 'SEA';
  return 'SEA';
}

function normActivityTitle(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function readGitAssetsManifestMap(gitRoot) {
  const p = path.join(gitRoot, 'manifest.json');
  const map = {};
  if (!fs.existsSync(p)) return map;
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const it of m.items || []) {
      const k = normActivityTitle(it.title);
      if (k) map[k] = it;
    }
  } catch (e) {
    console.warn('git-assets manifest.json skipped:', e.message);
  }
  return map;
}

function findSubdirCaseInsensitive(activityPath, targetName) {
  if (!fs.existsSync(activityPath)) return null;
  const want = String(targetName || '').toLowerCase();
  const entries = fs.readdirSync(activityPath, { withFileTypes: true });
  const hit = entries.find((d) => d.isDirectory() && d.name.toLowerCase() === want);
  return hit ? path.join(activityPath, hit.name) : null;
}

function listPngsInDir(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.png$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort();
}

function copyGitAssetToUploads(srcPath) {
  const ext = path.extname(srcPath) || '.png';
  const destName = `ga-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  fs.copyFileSync(srcPath, path.join(uploadsDir, destName));
  return `http://localhost:${PORT}/uploads/${destName}`;
}

function newKvImageItem(url) {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 12), url };
}

function classifyGitAssetBannerSlot(filePath, baseName) {
  const compact = baseName.replace(/\s/g, '');
  if (/1029.*276|1029_276/i.test(compact)) return 'banner1029x276';
  if (/750.*200|750_200/i.test(compact)) return 'banner750x500';
  const dim = getPngDimensions(filePath);
  if (dim) {
    const t = classifyBySize(dim.width, dim.height);
    if (t === 'banner1029x276' || t === 'banner750x500') return t;
    const r = dim.width / Math.max(1, dim.height);
    if (r >= 3.2 && dim.height <= 420) return 'banner750x500';
    if (r >= 2.4 && dim.height <= 360) return 'banner1029x276';
  }
  return 'banner1029x276';
}

function parseGitAssetAvatarMeta(baseName) {
  const type = /viewer/i.test(baseName) ? 'Viewer' : 'Creator';
  let level = 'LV1';
  if (/LV3\s*&\s*4|LV3&4/i.test(baseName)) level = 'LV3&4';
  else if (/LV2/i.test(baseName)) level = 'LV2';
  return { type, level };
}

/** POST body: { root?: string, mergeManifest?: boolean } — root 相对 cms 目录，默认 ../git-assets；mergeManifest 为 true 时才读 manifest.json 合并元数据 */
app.post('/api/import-git-assets', (req, res) => {
  try {
    const rel = (req.body && req.body.root) || '../git-assets';
    const gitRoot = path.isAbsolute(rel) ? rel : path.resolve(__dirname, rel);
    if (!fs.existsSync(gitRoot)) {
      return res.status(400).json({ error: `目录不存在: ${gitRoot}（请确认已拉取 kv-platform/git-assets）` });
    }

    const mergeManifest = req.body && req.body.mergeManifest === true;
    const manifestMap = mergeManifest ? readGitAssetsManifestMap(gitRoot) : {};
    const dirNames = fs
      .readdirSync(gitRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);

    const db = readDB();
    const imported = [];

    for (const folderName of dirNames) {
      const activityPath = path.join(gitRoot, folderName);
      const meta = manifestMap[normActivityTitle(folderName)] || {};

      const kvPaths = listPngsInDir(findSubdirCaseInsensitive(activityPath, 'KV'));
      const h5Paths = listPngsInDir(findSubdirCaseInsensitive(activityPath, 'H5'));
      const bannerPaths = listPngsInDir(findSubdirCaseInsensitive(activityPath, 'banner'));
      const afPaths = listPngsInDir(findSubdirCaseInsensitive(activityPath, 'AvatarFrame'));
      const iconsPaths = listPngsInDir(findSubdirCaseInsensitive(activityPath, 'icons'));

      if (
        kvPaths.length === 0 &&
        h5Paths.length === 0 &&
        bannerPaths.length === 0 &&
        afPaths.length === 0 &&
        iconsPaths.length === 0
      ) {
        continue;
      }

      const images = {
        kv: [],
        h5: [],
        banner1029x276: [],
        banner750x500: [],
        avatarFrame: [],
        icons: [],
      };

      for (const p of kvPaths) {
        const url = copyGitAssetToUploads(p);
        images.kv.push(newKvImageItem(url));
      }
      for (const p of h5Paths) {
        const url = copyGitAssetToUploads(p);
        images.h5.push(newKvImageItem(url));
      }
      for (const p of bannerPaths) {
        const base = path.basename(p);
        const slot = classifyGitAssetBannerSlot(p, base);
        const url = copyGitAssetToUploads(p);
        images[slot].push(newKvImageItem(url));
      }
      for (const p of afPaths) {
        const base = path.basename(p);
        const { type, level } = parseGitAssetAvatarMeta(base);
        const url = copyGitAssetToUploads(p);
        images.avatarFrame.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 12),
          url,
          type,
          level,
        });
      }
      for (const p of iconsPaths) {
        const url = copyGitAssetToUploads(p);
        images.icons.push(newKvImageItem(url));
      }

      const mainUrl = images.kv[0]?.url || images.h5[0]?.url || '';
      const titleFromFolder = folderName;
      const kv = {
        id: `ga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        published: meta.published ?? false,
        designer: meta.designer || '',
        title: meta.title || titleFromFolder,
        date: meta.date || new Date().toISOString().slice(0, 10),
        region: normalizeCmsRegion(meta.region || parseRegionFromTitle(titleFromFolder)),
        level: meta.level || 'TOP',
        imageUrl: mainUrl,
        isIP: !!meta.isIP,
        type: meta.type || 'Key Visual',
        gameplay: meta.gameplay || '',
        figmaUrl: meta.figmaUrl || '',
        categories: {
          theme: meta.categories?.theme ?? '',
          style: meta.categories?.style ?? '',
          colorTone: meta.categories?.colorTone ?? '',
          vibe: meta.categories?.vibe ?? '',
          element: meta.categories?.element ?? '',
          size: meta.categories?.size ?? '',
          ipCampaign: meta.categories?.ipCampaign ?? 'NonIP',
          collaboration: meta.categories?.collaboration ?? 'Non collaborate',
        },
        images,
      };

      db.kvs.unshift(kv);
      imported.push({ id: kv.id, title: kv.title });
    }

    writeDB(db);
    res.json({ imported: imported.length, items: imported, root: gitRoot });
  } catch (error) {
    console.error('import-git-assets:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

const KNOWN_LEVELS_CRAWL = ['TOP', 'MATURE', 'MID', 'LOW'];
const KNOWN_REGIONS_CRAWL = ['GLOBAL', 'SEA', 'NEA', 'EU', 'MENA', 'LATAM', 'US', 'ANZ', 'CN'];

// Identity vocabulary for avatar frame spatial analysis
const IDENTITY_VOCAB = {
  Creator: ['creator', 'anchor', '主播', 'host', 'broadcaster', 'author', '连麦方', '房主', 'owner'],
  Audience: ['audience', 'viewer', '观众', 'watcher', 'fan', 'user', 'guest', '连线者', '粉丝', '用户', '用户侧'],
};

// S/M/L size labels → LV mapping (from your Figma template)
const SIZE_TO_LEVEL = { s: 'LV1', m: 'LV2', l: 'LV3&4' };

function fetchRemoteJSON(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'X-Figma-Token': token } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadToFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`Download HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

// dHash for dedup
function computeDHash(filePath) {
  try {
    const PNG = require('pngjs').PNG;
    const data = fs.readFileSync(filePath);
    const png = PNG.sync.read(data);
    const { width, height } = png;
    const HS = 8, scaleW = HS + 1;
    const getGray = (x, y) => {
      const sx = Math.min(Math.floor(x * width / scaleW), width - 1);
      const sy = Math.min(Math.floor(y * height / HS), height - 1);
      const i = (sy * width + sx) * 4;
      return 0.299 * png.data[i] + 0.587 * png.data[i+1] + 0.114 * png.data[i+2];
    };
    let bits = '';
    for (let y = 0; y < HS; y++)
      for (let x = 0; x < HS; x++)
        bits += getGray(x, y) > getGray(x+1, y) ? '1' : '0';
    return BigInt('0b' + bits).toString(16).padStart(16, '0');
  } catch { return null; }
}

function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 99;
  let dist = 0; let xor = BigInt('0x'+a) ^ BigInt('0x'+b);
  while (xor > 0n) { dist += Number(xor & 1n); xor >>= 1n; }
  return dist;
}

function isDuplicate(hash, knownHashes, threshold = 5) {
  if (!hash) return false;
  return knownHashes.some(h => hammingDistance(hash, h) <= threshold);
}

// ── 仅按尺寸收集：递归整棵树，忽略命名；深层节点优先 ──
function collectFramesBySizeOnly(node) {
  const byType = { kv: [], h5: [], banner1029x276: [], banner750x500: [], avatarFrame: [], icons: [] };

  const walk = (n, depth = 0, parentHidden = false) => {
    if (!n) return;
    const hidden = parentHidden || n.visible === false;
    if (hidden) return;
    const isFrame = ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(n.type);
    if (isFrame && n.absoluteBoundingBox) {
      const bb = n.absoluteBoundingBox;
      const w = bb.width, h = bb.height;
      const assetType = classifyBySize(w, h);
      if (assetType && byType[assetType]) {
        byType[assetType].push({
          id: n.id, name: n.name || 'Untitled',
          width: w, height: h,
          centerX: bb.x + w / 2,
          centerY: bb.y + h / 2,
          bbox: bb,
          depth,
        });
      }
    }
    if (n.children) n.children.forEach(child => walk(child, depth + 1, hidden));
  };

  walk(node);

  // 同尺寸同坐标重复时，只保留更深层的节点（避免父容器遮蔽真实素材）
  for (const type of Object.keys(byType)) {
    const items = byType[type];
    items.sort((a, b) => b.depth - a.depth);
    const seen = new Set();
    byType[type] = items.filter(item => {
      const key = `${Math.round(item.bbox.x)}_${Math.round(item.bbox.y)}_${Math.round(item.width)}_${Math.round(item.height)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return byType;
}

/** 调试用：收集本页所有 Frame 的尺寸（整树遍历），最多 max 个 */
function collectAllFrameSizes(node, max = 30) {
  const out = [];
  const walk = (n, parentHidden = false) => {
    if (out.length >= max) return;
    if (!n) return;
    const hidden = parentHidden || n.visible === false;
    if (hidden) return;
    const isFrame = ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(n.type);
    if (isFrame && n.absoluteBoundingBox) {
      const w = Math.round(n.absoluteBoundingBox.width);
      const h = Math.round(n.absoluteBoundingBox.height);
      out.push(`${w}×${h}`);
    }
    if (n.children) n.children.forEach(child => walk(child, hidden));
  };
  walk(node);
  return out;
}

/** 调试用：收集接近 750×200 的候选尺寸，便于定位“看起来是 750×200 但没命中”的情况 */
function collectNear750x200Candidates(node, max = 20) {
  const out = [];
  const walk = (n, parentHidden = false) => {
    if (out.length >= max) return;
    if (!n) return;
    const hidden = parentHidden || n.visible === false;
    if (hidden) return;
    const isFrame = ['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(n.type);
    if (isFrame && n.absoluteBoundingBox) {
      const w = Math.round(n.absoluteBoundingBox.width);
      const h = Math.round(n.absoluteBoundingBox.height);
      const ratio = w / h;
      if (w >= 650 && w <= 850 && h >= 130 && h <= 300 && ratio >= 2.2 && ratio <= 5.5) {
        out.push(`${w}×${h}`);
      }
    }
    if (n.children) n.children.forEach(child => walk(child, hidden));
  };
  walk(node);
  return out;
}

// ── Step C: Within a section, collect all text nodes ──
function collectTexts(node) {
  const texts = [];
  const walk = (n, parentHidden = false) => {
    if (!n) return;
    const hidden = parentHidden || n.visible === false;
    if (hidden) return;
    if (n.type === 'TEXT' && n.absoluteBoundingBox) {
      const content = (n.characters || '').trim();
      if (content) {
        const bb = n.absoluteBoundingBox;
        texts.push({
          text: content,
          x: bb.x, y: bb.y, width: bb.width,
          centerX: bb.x + bb.width / 2,
          centerY: bb.y + bb.height / 2,
        });
      }
    }
    if (n.children) n.children.forEach(child => walk(child, hidden));
  };
  walk(node);
  return texts;
}

// ── Step D: Classify banner sub-type by actual frame dimensions ──
// Also useful for double-checking other types if needed, though SIZE_RULES handles primary detection.
function classifyBanner(frame) {
  const w = frame.width, h = frame.height;
  const ratio = w / h;
  if (w > 900 && ratio > 3) return 'banner1029x276';
  if (w > 600 && ratio < 2) return 'banner750x500';
  if (ratio > 3) return 'banner1029x276';
  return 'banner750x500';
}

// ── Step E: Avatar Frame spatial analysis ──
function normalizeIdentity(text) {
  const lower = text.toLowerCase();
  for (const [std, syns] of Object.entries(IDENTITY_VOCAB)) {
    for (const s of syns) { if (lower.includes(s)) return std; }
  }
  return null;
}

function extractSizeLevel(text) {
  if (!text) return '';
  const lower = text.toLowerCase().trim();
  // Match "S (lv1)" or "M (lv 2)" or standalone "lv1"
  const lvMatch = lower.match(/(?:lv|level|lvl)[.\-_\s]?(\d+)/);
  if (lvMatch) {
    const n = lvMatch[1];
    if (n === '1') return 'LV1';
    if (n === '2') return 'LV2';
    return 'LV3&4';
  }
  // Match standalone S / M / L
  if (/^\s*s\s*$/i.test(lower) || lower === 'small') return 'LV1';
  if (/^\s*m\s*$/i.test(lower) || lower === 'medium') return 'LV2';
  if (/^\s*l\s*$/i.test(lower) || lower === 'large') return 'LV3&4';
  return '';
}

function analyzeAvatarFrames(frames, texts) {
  let creatorAnchor = null, audienceAnchor = null;

  for (const t of texts) {
    const id = normalizeIdentity(t.text);
    if (id === 'Creator' && !creatorAnchor) creatorAnchor = t;
    else if (id === 'Audience' && !audienceAnchor) audienceAnchor = t;
  }

  const parseLevelLoose = (txt) => {
    const parsed = extractSizeLevel(txt);
    if (parsed) return parsed;
    const lower = (txt || '').toLowerCase();
    if (lower.includes('(for lv1)') || /\bs\b/.test(lower)) return 'LV1';
    if (lower.includes('(for lv2)') || /\bm\b/.test(lower)) return 'LV2';
    if (lower.includes('(for lv3-4)') || lower.includes('(for lv3&4)') || /\bl\b/.test(lower)) return 'LV3&4';
    return '';
  };

  let results = frames.map(frame => {
    const cx = frame.centerX;

    // Identity: proximity to 主播/观众 text anchor
    let identity = 'Creator';
    if (creatorAnchor && audienceAnchor) {
      identity = Math.abs(cx - creatorAnchor.centerX) < Math.abs(cx - audienceAnchor.centerX) ? 'Creator' : 'Viewer';
    } else if (audienceAnchor && Math.abs(cx - audienceAnchor.centerX) < 2000) {
      identity = 'Viewer';
    }

    // Level: 优先找离该头像框最近的等级文本（下方优先）
    let level = 'LV1', bestDist = Infinity;
    for (const t of texts) {
      const yDist = t.centerY - frame.centerY;
      const xDist = Math.abs(t.centerX - cx);
      if (yDist > -40 && yDist < 420 && xDist < 220) {
        const parsed = parseLevelLoose(t.text);
        if (parsed && yDist < bestDist) {
          bestDist = yDist;
          level = parsed;
        }
      }
    }

    return { ...frame, identity, level };
  });

  // 兜底1：如果没有“主播/观众”锚点，按 x 轴分左右列（左=Creator，右=Viewer）
  if (!creatorAnchor && !audienceAnchor && results.length > 0) {
    const sorted = [...results].sort((a, b) => a.centerX - b.centerX);
    const midX = sorted[Math.floor(sorted.length / 2)].centerX;
    results = results.map(r => ({ ...r, identity: r.centerX <= midX ? 'Creator' : 'Viewer' }));
  }

  // 兜底2：如果某些 level 仍是默认值，按每个身份组的 x 顺序填 LV1/LV2/LV3&4
  const fillByOrder = (group) => {
    const order = ['LV1', 'LV2', 'LV3&4'];
    const g = [...group].sort((a, b) => a.centerX - b.centerX);
    return g.map((item, i) => {
      if (item.level && item.level !== 'LV1') return item;
      return { ...item, level: order[Math.min(i, 2)] };
    });
  };
  const creators = fillByOrder(results.filter(r => r.identity === 'Creator'));
  const viewers = fillByOrder(results.filter(r => r.identity === 'Viewer'));
  const others = results.filter(r => r.identity !== 'Creator' && r.identity !== 'Viewer');
  results = [...creators, ...viewers, ...others];

  return results;
}

// ── 按尺寸扫描整页，不依赖命名 ──
function discoverSectionsBySizeOnly(page, send) {
  const byType = collectFramesBySizeOnly(page);
  const texts = collectTexts(page);

  const sections = [];
  const typeLabels = { kv: 'KV', h5: 'H5', banner1029x276: 'Banner1029×276', banner750x500: 'Banner750×200/500', avatarFrame: 'AvatarFrame', icons: 'Icons' };
  for (const [type, frames] of Object.entries(byType)) {
    if (frames.length === 0) continue;
    send('progress', { step: 'analyze', message: `    📐 ${typeLabels[type]} (按尺寸): ${frames.length} 个` });
    sections.push({ type, name: typeLabels[type], frames, texts });
  }

  const totalFound = Object.values(byType).reduce((s, arr) => s + arr.length, 0);
  if (totalFound === 0 || byType.kv.length === 0) {
    const sizes = collectAllFrameSizes(page);
    send('progress', { step: 'analyze', message: `    🔍 本页出现的尺寸（前30）: ${sizes.length ? sizes.join(', ') : '无'}` });
  }
  if (byType.banner750x500.length === 0) {
    const near = collectNear750x200Candidates(page);
    if (near.length) {
      send('progress', { step: 'analyze', message: `    🧪 接近 750×200 的候选尺寸: ${near.join(', ')}` });
    }
  }

  return sections;
}

// ── Parse page name for region/level ──
function parsePageNameParts(name) {
  const parts = name.split(/[_\-\s]+/);
  let level = '', region = '';
  const titleParts = [];
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (KNOWN_LEVELS_CRAWL.includes(upper) && !level) level = upper;
    else if (KNOWN_REGIONS_CRAWL.includes(upper) && !region) region = upper;
    else titleParts.push(part);
  }
  return { level, region, title: titleParts.join(' ') };
}

// 跳过参考/草稿类页面（按 page 名称）
function shouldSkipPage(name = '') {
  const n = String(name).toLowerCase();
  const patterns = [
    '✈',
    '草稿',
    '参考',
    'reference',
    'refer',
    'ref',
    'draft',
    'wip',
    'sample',
    '示例',
    'temp',
    'tmp',
  ];
  return patterns.some(p => n.includes(p));
}

function normalizeDateString(raw = '') {
  const m = String(raw).trim().match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (!m) return '';
  const y = m[1];
  const mo = m[2].padStart(2, '0');
  const d = m[3].padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// 从页面顶部左侧头信息中提取活动名/设计师/上传日期
function extractCampaignMetaFromPage(page) {
  const texts = collectTexts(page);
  if (!texts.length) return { title: '', designer: '', uploadDate: '' };

  const minY = Math.min(...texts.map(t => t.y));
  const topBand = texts.filter(t => t.y <= minY + 240);
  if (!topBand.length) return { title: '', designer: '', uploadDate: '' };

  const minX = Math.min(...topBand.map(t => t.x));
  const leftBand = topBand.filter(t => t.x <= minX + 900).sort((a, b) => (a.y - b.y) || (a.x - b.x));

  const lines = [];
  for (const t of leftBand) {
    for (const line of String(t.text || '').split('\n')) {
      const s = line.trim();
      if (s) lines.push(s);
    }
  }

  let title = '';
  let designer = '';
  let uploadDate = '';

  for (const line of lines) {
    const dMatch = line.match(/designer\s*[:：]\s*(.+)$/i);
    if (dMatch && !designer) {
      designer = dMatch[1].trim();
      continue;
    }
    const dateMatch = line.match(/(?:upload\s*date|date)\s*[:：]\s*([0-9]{4}[.\-\/][0-9]{1,2}[.\-\/][0-9]{1,2})/i);
    if (dateMatch && !uploadDate) {
      uploadDate = normalizeDateString(dateMatch[1]);
      continue;
    }
    const isMeta = /designer\s*[:：]|upload\s*date|^\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/i.test(line);
    if (!title && !isMeta && !/tiktok/i.test(line) && line.length >= 3) {
      title = line;
    }
  }

  return { title, designer, uploadDate };
}

// ── Figma images export with timeout fallback ──
async function fetchImageUrlsSafe(fileKey, nodeIds, token, imgScale, send, isCancelled = () => false) {
  const imageUrlMap = {};
  if (!nodeIds || nodeIds.length === 0) return imageUrlMap;

  const BATCH = 8;
  for (let i = 0; i < nodeIds.length; i += BATCH) {
    if (isCancelled()) throw new Error('Crawl cancelled by user');
    const batch = nodeIds.slice(i, i + BATCH);
    send('progress', { step: 'export', message: `  导出图片 ${i + 1}-${Math.min(i + BATCH, nodeIds.length)} / ${nodeIds.length}...` });
    const ids = batch.join(',');
    try {
      const imgData = await fetchRemoteJSON(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=${imgScale}`,
        token
      );
      Object.assign(imageUrlMap, imgData.images || {});
    } catch (err) {
      const msg = String(err?.message || err || '');
      const isRenderTimeout = msg.includes('Render timeout');
      if (!isRenderTimeout || batch.length === 1) {
        throw err;
      }
      send('progress', { step: 'export', message: `  ⚠️ 批量导出超时，自动拆分单图重试 (${batch.length} 张)...` });
      for (const id of batch) {
        if (isCancelled()) throw new Error('Crawl cancelled by user');
        try {
          const one = await fetchRemoteJSON(
            `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(id)}&format=png&scale=${imgScale}`,
            token
          );
          if (one.images && one.images[id]) imageUrlMap[id] = one.images[id];
        } catch (singleErr) {
          const singleMsg = String(singleErr?.message || singleErr || '');
          if (singleMsg.includes('Render timeout') && imgScale > 1) {
            // Fallback to 1x if 2x/3x still times out
            try {
              const one1x = await fetchRemoteJSON(
                `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(id)}&format=png&scale=1`,
                token
              );
              if (one1x.images && one1x.images[id]) {
                imageUrlMap[id] = one1x.images[id];
                send('progress', { step: 'export', message: `    ↘ 单图超时，已降级 1x 成功: ${id}` });
                continue;
              }
            } catch (_) {
              // fall through to warning below
            }
          }
          send('progress', { step: 'export', message: `    ⚠️ 单图导出失败，跳过: ${id}` });
        }
      }
    }
  }

  return imageUrlMap;
}

// ══════════════════════════════════════════════════════════════
// Crawl a single Figma file — returns { campaigns, totalFrames }
// ══════════════════════════════════════════════════════════════
async function crawlSingleFile(fileKey, token, imgScale, defaultTags, send, options = {}) {
  const { crawlTypes = ['kv', 'avatarFrame', 'banner1029x276', 'banner750x500'] } = options;
  const isCancelled = options.isCancelled || (() => false);
  send('progress', { step: 'fetch', message: `正在获取文件结构: ${fileKey}...` });
  const fileData = await fetchRemoteJSON(`https://api.figma.com/v1/files/${fileKey}`, token);
  const fileName = fileData.name || 'Untitled';
  send('progress', { step: 'fetch', message: `📄 文件: "${fileName}"` });

  send('progress', { step: 'analyze', message: '正在按尺寸扫描页面（忽略命名）...' });
  const campaigns = [];

  for (const page of fileData.document.children) {
    if (isCancelled()) throw new Error('Crawl cancelled by user');
    if (!page.children || page.children.length === 0) continue;
    if (shouldSkipPage(page.name)) {
      send('progress', { step: 'analyze', message: `  ⏭️ 跳过页面（参考/草稿）: "${page.name}"` });
      continue;
    }
    const pageParsed = parsePageNameParts(page.name);
    const pageMeta = extractCampaignMetaFromPage(page);
    send('progress', { step: 'analyze', message: `  📄 页面: "${page.name}"` });
    if (pageMeta.title || pageMeta.designer || pageMeta.uploadDate) {
      send('progress', {
        step: 'analyze',
        message: `      🏷️ 活动信息: ${pageMeta.title || '-'} | Designer: ${pageMeta.designer || '-'} | Date: ${pageMeta.uploadDate || '-'}`
      });
    }

    const sections = discoverSectionsBySizeOnly(page, send);
    if (sections.length === 0) {
      send('progress', { step: 'analyze', message: `      ⚠️ 未发现符合尺寸的素材，跳过` });
      continue;
    }

    const analyzed = [];
    for (const section of sections) {
      if (crawlTypes && crawlTypes.length > 0 && !crawlTypes.includes(section.type)) {
        continue;
      }
      if (section.type === 'avatarFrame') {
        const avatarResults = analyzeAvatarFrames(section.frames, section.texts);
        for (const af of avatarResults) {
          send('progress', { step: 'analyze', message: `      🎯 头像框: ${af.identity} / ${af.level} → "${af.name}"` });
          analyzed.push({ nodeId: af.id, name: af.name, assetType: 'avatarFrame', identity: af.identity, level: af.level });
        }
      } else {
        for (const f of section.frames) {
          analyzed.push({ nodeId: f.id, name: f.name, assetType: section.type });
        }
      }
    }

    // 业务规则：KV 是主素材。若该页没有 KV，则整页跳过（其余素材不爬）
    const hasKv = analyzed.some(a => a.assetType === 'kv');
    if (!hasKv) {
      send('progress', { step: 'analyze', message: `      ⏭️ 跳过页面（无 KV 尺寸素材）: "${page.name}"` });
      continue;
    }

    const title = pageMeta.title || pageParsed.title || page.name;
    const titleRegion = parseRegionFromTitle(title);

    campaigns.push({
      title,
      designer: pageMeta.designer || '',
      uploadDate: pageMeta.uploadDate || '',
      pageName: page.name,
      region: pageParsed.region || titleRegion || 'GLOBAL',
      level: pageParsed.level || 'TOP',
      analyzed,
    });
  }

  // Export images
  const allNodeIds = campaigns.flatMap(c => c.analyzed.map(f => f.nodeId));
  const imageUrlMap = await fetchImageUrlsSafe(fileKey, allNodeIds, token, imgScale, send, isCancelled);

  return { fileName, fileKey, campaigns, imageUrlMap };
}

// 显式取消爬取（用户点击停止时调用）
app.post('/api/figma-cancel', (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId && typeof sessionId === 'string') {
    crawlCancelMap.set(sessionId, true);
  }
  res.json({ ok: true });
});

// ══════════════════════════════════
// SSE endpoint — real-time crawl
// Supports: file URL, design URL, project URL, or raw fileKey/projectId
// ══════════════════════════════════
app.post('/api/figma-crawl', async (req, res) => {
  const sessionId = 'crawl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  crawlCancelMap.set(sessionId, false);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const send = (type, data) => {
    if (!res.writableEnded) {
      try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch (_) { /* 连接已关闭 */ }
    }
  };

  // Keep-alive：每 10 秒发送一次
  const KEEPALIVE_MS = 10000;
  let keepAliveTimer = null;
  const startKeepAlive = () => {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
      if (!res.writableEnded && !crawlCancelMap.get(sessionId)) {
        try { res.write(`: keepalive ${Date.now()}\n\n`); } catch (_) {}
      }
    }, KEEPALIVE_MS);
  };
  const stopKeepAlive = () => {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  };

  const isCancelled = () => !!crawlCancelMap.get(sessionId);
  const ensureNotCancelled = () => {
    if (isCancelled()) throw new Error('Crawl cancelled by user');
  };

  // 断点续传：停止时保留已下载的 items，供 catch 中发送
  let partialItems = [];
  let partialDownloaded = 0;
  let partialSkipped = 0;
  let partialSaveRoot = '';
  let partialFilesProcessed = 0;

  try {
    startKeepAlive();
    const { figmaUrl, token, scale, autoImport, enableDedup, localSavePath, crawlTypes } = req.body;
    if (!figmaUrl || !token) {
      send('error', { message: 'figmaUrl and token are required' });
      res.end(); return;
    }

    const imgScale = scale || 2;

    // ─── Detect link type ───
    const fileMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    const projectMatch = figmaUrl.match(/project[s]?\/(\d+)/);
    const rawKeyMatch = figmaUrl.match(/^([a-zA-Z0-9]{20,})$/);

    let filesToCrawl = []; // Array of { fileKey, fileName }

    send('progress', { step: 'init', sessionId, message: '开始爬取...' });

    if (fileMatch) {
      // Single file URL
      filesToCrawl = [{ fileKey: fileMatch[1], fileName: null }];
      send('progress', { step: 'fetch', sessionId, message: '🔗 检测到: 单个文件链接' });
    } else if (projectMatch) {
      // Project URL — list all files first
      const projectId = projectMatch[1];
      send('progress', { step: 'fetch', message: `📁 检测到: 项目链接 (ID: ${projectId})，正在获取文件列表...` });
      const projData = await fetchRemoteJSON(`https://api.figma.com/v1/projects/${projectId}/files`, token);
      const files = projData.files || [];
      if (files.length === 0) {
        send('error', { message: `项目 ${projectId} 下没有文件` });
        res.end(); return;
      }
      filesToCrawl = files.map(f => ({ fileKey: f.key, fileName: f.name }));
      send('progress', { step: 'fetch', message: `📁 项目包含 ${files.length} 个文件:` });
      files.forEach((f, i) => {
        send('progress', { step: 'fetch', message: `    [${i + 1}] ${f.name}` });
      });
    } else if (rawKeyMatch) {
      // Raw file key
      filesToCrawl = [{ fileKey: rawKeyMatch[1], fileName: null }];
      send('progress', { step: 'fetch', message: '🔑 检测到: 文件 Key' });
    } else {
      send('error', { message: '无法识别链接格式。支持: 文件链接、项目链接、或文件 Key' });
      res.end(); return;
    }

    // ─── Crawl each file ───
    const allCrawled = []; // { fileKey, fileName, campaigns, imageUrlMap }

    for (let fi = 0; fi < filesToCrawl.length; fi++) {
      ensureNotCancelled();
      const { fileKey, fileName: overrideName } = filesToCrawl[fi];
      if (filesToCrawl.length > 1) {
        send('progress', { step: 'fetch', message: `\n════════════════════════════════` });
        send('progress', { step: 'fetch', message: `📄 文件 [${fi + 1}/${filesToCrawl.length}]: ${overrideName || fileKey}` });
        send('progress', { step: 'fetch', message: `════════════════════════════════` });
      }

      try {
        const result = await crawlSingleFile(fileKey, token, imgScale, null, send, {
          crawlTypes: (crawlTypes && crawlTypes.length > 0) ? crawlTypes : ['kv', 'avatarFrame', 'banner1029x276', 'banner750x500'],
          isCancelled,
        });
        allCrawled.push(result);
      } catch (err) {
        send('progress', { step: 'fetch', message: `⚠️ 文件 ${overrideName || fileKey} 爬取失败: ${err.message}` });
      }
    }

    // ─── Summarize all campaigns ───
    const allCampaigns = [];
    for (const crawled of allCrawled) {
      for (const campaign of crawled.campaigns) {
        allCampaigns.push({ ...campaign, fileKey: crawled.fileKey, fileName: crawled.fileName });
      }
    }

    const totalFrames = allCampaigns.reduce((s, c) => s + c.analyzed.length, 0);
    const activeTypes = (crawlTypes && crawlTypes.length > 0) ? crawlTypes.join(', ') : 'kv, banner1029x276, banner750x500';
    send('progress', { step: 'analyze', message: `\n✅ 全部扫描完成: ${allCrawled.length} 个文件, ${allCampaigns.length} 个活动, ${totalFrames} 个素材（类型: ${activeTypes}）` });

    if (totalFrames === 0) {
      send('done', { imported: 0, items: [], downloaded: 0, skippedDuplicates: 0, message: '未发现可导出的素材' });
      res.end(); return;
    }

    // ─── Download + dedup + local save ───
    send('progress', { step: 'download', message: '正在下载图片...' });

    const saveRoot = localSavePath ? path.resolve(localSavePath) : path.resolve(__dirname, '..', 'Assets_Library');
    const sanitizeName = (s) => s.replace(/[<>:"/\\|?*]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').trim() || 'Untitled';

    const ASSET_TYPE_FOLDER = {
      kv: 'KV', h5: 'H5',
      banner1029x276: 'banner', banner750x500: 'banner',
      avatarFrame: 'AvatarFrame', icons: 'Icons',
    };

    const dbForTags = readDB();
    const tagOptions = dbForTags.tagOptions || {};

    // Load local hashes (persistent)
    let localHashes = [];
    if (enableDedup !== false) {
      const scanDir = (dir) => {
        if (!fs.existsSync(dir)) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) scanDir(full);
            else if (e.name.endsWith('.png')) {
              const h = computeDHash(full); if (h) localHashes.push({ hash: h, path: full });
            }
          }
        } catch { /* ignore access errors */ }
      };
      scanDir(saveRoot);
      if (localHashes.length > 0) {
        send('progress', { step: 'download', message: `dHash 去重: 已加载本地库 ${localHashes.length} 张图片指纹` });
      }
    }
    
    // Session hashes (for internal dedup within this crawl)
    let sessionHashes = [];

    // Build imageUrlMap lookup combining all files
    const globalImageMap = {};
    for (const crawled of allCrawled) {
      Object.assign(globalImageMap, crawled.imageUrlMap);
    }

    let downloaded = 0;
    let skippedDuplicates = 0;
    let reusedLocal = 0;
    let skippedInternal = 0;
    partialSaveRoot = saveRoot;
    partialFilesProcessed = allCrawled.length;

    for (const campaign of allCampaigns) {
      ensureNotCancelled();
      const images = { kv: [], h5: [], banner1029x276: [], banner750x500: [], avatarFrame: [], icons: [] };
      const campaignFolder = sanitizeName(campaign.title);
      let kvRemoteUrlForTagging = '';
      let kvFrameNameForTagging = '';
      let kvDimsForTagging = null;

      for (const frame of campaign.analyzed) {
        ensureNotCancelled();
        const remoteUrl = globalImageMap[frame.nodeId];
        if (!remoteUrl) continue;

        if (frame.assetType === 'kv' && !kvRemoteUrlForTagging) {
          kvRemoteUrlForTagging = remoteUrl;
          kvFrameNameForTagging = frame.name || '';
        }

        const tmpName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const tmpPath = path.join(uploadsDir, tmpName);
        try {
          await downloadToFile(remoteUrl, tmpPath);
        } catch (e) {
          send('progress', { step: 'download', message: `⚠️ 下载失败: ${frame.name}` });
          continue;
        }

        let hash = null;
        if (enableDedup !== false) {
          hash = computeDHash(tmpPath);

          const sessionDup = sessionHashes.find(item => hammingDistance(hash, item.hash) <= 5);
          if (sessionDup) {
            skippedDuplicates++;
            skippedInternal++;
            send('progress', { step: 'download', message: `🔁 发现本次重复（跳过保存/上传）: ${frame.name}` });
            try { fs.unlinkSync(tmpPath); } catch {}
            continue;
          }

          const localDup = localHashes.find(item => hammingDistance(hash, item.hash) <= 5);
          if (localDup) {
            skippedDuplicates++;
            reusedLocal++;
            send('progress', { step: 'download', message: `📚 本地已存在（自动填充预览，不保存/上传）: ${frame.name}` });
            try { fs.unlinkSync(tmpPath); } catch {}

            const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            const assetType = frame.assetType;
            const localUrl = `http://localhost:${PORT}/api/local-file?path=${encodeURIComponent(localDup.path)}`;

            if (assetType === 'kv' && !kvDimsForTagging) {
              kvDimsForTagging = getPngDimensions(localDup.path);
            }

            if (hash) sessionHashes.push({ hash, url: localUrl });

            if (assetType === 'avatarFrame') {
              images.avatarFrame.push({ id: uid, url: localUrl, type: frame.identity || 'Creator', level: frame.level || 'LV1', badgeText: '本地' });
            } else {
              images[assetType].push({ id: uid, url: localUrl, badgeText: '本地' });
            }
            continue;
          }
        }

        downloaded++;
        const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const assetType = frame.assetType;

        const typeFolder = ASSET_TYPE_FOLDER[assetType] || assetType;
        let prettyName = sanitizeName(frame.name);
        if (assetType === 'avatarFrame') {
          prettyName = `${frame.identity || 'Creator'}_${frame.level || 'LV1'}_${prettyName}`;
        }
        const localFileName = `${campaignFolder}_${prettyName}_${frame.nodeId.replace(':', '-')}.png`;

        const localDir = path.join(saveRoot, campaignFolder, typeFolder);
        if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
        const localFilePath = path.join(localDir, localFileName);

        fs.copyFileSync(tmpPath, localFilePath);

        if (assetType === 'kv' && !kvDimsForTagging) {
          kvDimsForTagging = getPngDimensions(localFilePath);
        }

        const finalUrl = `http://localhost:${PORT}/uploads/${tmpName}`;
        if (enableDedup !== false) {
          const finalHash = hash || computeDHash(localFilePath);
          if (finalHash) sessionHashes.push({ hash: finalHash, url: finalUrl });
        }

        if (assetType === 'avatarFrame') {
          images.avatarFrame.push({ id: uid, url: finalUrl, type: frame.identity || 'Creator', level: frame.level || 'LV1' });
        } else {
          images[assetType].push({ id: uid, url: finalUrl });
        }

        if ((downloaded + skippedDuplicates) % 3 === 0) {
          send('progress', { step: 'download', message: `进度: ${downloaded} 下载 / ${totalFrames} 总计` });
        }
      }

      send('progress', { step: 'tag', message: `🏷️ 自动打标中: ${campaign.title}` });
      const tagResult = await autoTagCampaign({
        title: campaign.title,
        kvUrl: kvRemoteUrlForTagging,
      }, tagOptions);

      let categories = normalizeAutoTaggedCategories(tagResult?.categories || {});
      categories = fillCategoriesFromHeuristics(categories, {
        title: campaign.title,
        pageName: campaign.pageName,
        fileName: campaign.fileName,
        kvFrameName: kvFrameNameForTagging,
        kvDims: kvDimsForTagging,
      }, tagOptions);
      const picked = Object.entries(categories).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ');
      const pickedMsg = picked ? ` → ${picked}` : ' → （未命中任何标签）';
      const errMsg = tagResult?.error ? ` ｜ ${tagResult.error}` : '';
      send('progress', { step: 'tag', message: `🏷️ 打标完成 (${tagResult?.source || 'unknown'}${errMsg}): ${campaign.title}${pickedMsg}` });

      partialItems.push({
        title: campaign.title,
        date: campaign.uploadDate || new Date().toISOString().slice(0, 10),
        designer: campaign.designer || '',
        region: campaign.region,
        level: campaign.level,
        figmaUrl: `https://www.figma.com/file/${campaign.fileKey}`,
        categories,
        tagMeta: {
          source: tagResult?.source,
          error: tagResult?.error,
          raw: tagResult?.raw,
          model: tagResult?.model,
          usedImage: tagResult?.usedImage,
        },
        isIP: false,
        imageUrl: images.kv[0]?.url || '',
        images,
        _localFolder: path.join(saveRoot, campaignFolder),
      });
      partialDownloaded = downloaded;
      partialSkipped = skippedDuplicates;
    }

    send('progress', { step: 'download', message: `✅ 下载完成: ${downloaded} 张新图片, ${skippedDuplicates} 张去重处理（本次重复 ${skippedInternal} / 本地复用 ${reusedLocal}）` });
    send('progress', { step: 'download', message: `📁 本地保存: ${saveRoot}` });

    // Write manifest
    try {
      const manifest = partialItems.map(item => ({
        title: item.title, date: item.date, designer: item.designer || '', region: item.region, level: item.level,
        figmaUrl: item.figmaUrl, categories: item.categories, localFolder: item._localFolder,
        images: { kv: item.images.kv.length, h5: item.images.h5.length,
          banner1029x276: item.images.banner1029x276.length, banner750x500: item.images.banner750x500.length,
          avatarFrame: item.images.avatarFrame.length, icons: item.images.icons.length },
      }));
      if (!fs.existsSync(saveRoot)) fs.mkdirSync(saveRoot, { recursive: true });
      fs.writeFileSync(path.join(saveRoot, 'manifest.json'),
        JSON.stringify({ crawledAt: new Date().toISOString(), totalFiles: allCrawled.length, items: manifest }, null, 2));
      send('progress', { step: 'download', message: `📄 manifest.json 已保存` });
    } catch { /* ignore */ }

    // Auto-import
    if (autoImport) {
      send('progress', { step: 'import', message: '正在导入到 CMS...' });
      const db = readDB();
      const imported = [];
      for (const item of partialItems) {
        ensureNotCancelled();
        const hasAny = Object.values(item.images).some(arr => arr.length > 0);
        if (!hasAny) continue;
        const kv = {
          id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
          published: false, title: item.title, date: item.date,
          designer: item.designer || '',
          region: item.region, level: item.level, imageUrl: item.imageUrl,
          isIP: !!item.isIP, type: 'Key Visual', gameplay: '',
          figmaUrl: item.figmaUrl,
          categories: {
            ...(item.categories || {}),
            ipCampaign: item.isIP ? 'IP' : (item.categories?.ipCampaign || 'NonIP'),
          },
          images: item.images,
        };
        db.kvs.unshift(kv);
        imported.push({ id: kv.id, title: kv.title });
      }
      writeDB(db);
      send('done', { imported: imported.length, items: imported, downloaded, skippedDuplicates, localPath: saveRoot, filesProcessed: allCrawled.length });
    } else {
      send('done', {
        imported: 0,
        items: partialItems.map(i => ({ title: i.title })),
        previewItems: partialItems,
        downloaded,
        skippedDuplicates,
        preview: true,
        localPath: saveRoot,
        filesProcessed: allCrawled.length
      });
    }
  } catch (err) {
    const msg = err?.message || 'Crawl failed';
    if (msg === 'Crawl cancelled by user') {
      send('progress', { step: 'fetch', message: '⏹️ 已停止本次爬取' });
      // 断点续传：若有已下载的素材，返回供预览导入
      if (partialItems.length > 0) {
        send('done', {
          imported: 0,
          items: partialItems.map(i => ({ title: i.title })),
          previewItems: partialItems,
          downloaded: partialDownloaded,
          skippedDuplicates: partialSkipped,
          preview: true,
          partial: true,
          localPath: partialSaveRoot,
          filesProcessed: partialFilesProcessed,
          message: '已停止，保留已下载的素材供预览导入'
        });
      } else {
        send('error', { message: '已停止，未发现可导出的素材' });
      }
    } else {
      send('error', { message: msg });
    }
  } finally {
    stopKeepAlive();
    crawlCancelMap.delete(sessionId);
  }
  if (!res.writableEnded) res.end();
});

// POST /api/figma-import - Confirm preview items and import into CMS
app.post('/api/figma-import', upload.any(), (req, res) => {
  try {
    console.log('Received import request.');
    console.log('Headers Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body));
    if (req.body.items) {
      console.log('Items type:', typeof req.body.items);
      console.log('Items length (string):', req.body.items.length);
      console.log('Items preview:', req.body.items.slice(0, 100));
    }
    console.log('Files count:', req.files ? req.files.length : 0);

    // Parse items from JSON string if it's coming from FormData
    let items;
    try {
      items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
    } catch (e) {
      console.error('JSON parse error for items:', e);
      items = [];
    }

    if (!items) {
       console.error('Items is undefined or null');
       return res.status(400).json({ error: 'Missing items field in body' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.error('Items is not an array or empty:', typeof items, items);
      return res.status(400).json({ error: 'No preview items to import (empty array)' });
    }

    // Map uploaded files (file:0, file:1...) to actual URLs
    const uploadedFiles = req.files || [];
    const fileMap = {};
    
    // Sort files by original index if possible? No, we rely on FormData order.
    // If upload.any() is used, order might not be preserved?
    // Multer preserves order for same fieldname.
    // But we should be careful.
    
    uploadedFiles.forEach((f, i) => {
      fileMap[`file:${i}`] = `http://localhost:${PORT}/uploads/${f.filename}`;
    });

    const db = readDB();
    const imported = [];
    for (const item of items) {
      const safeImages = item.images || {};
      
      // Resolve local file URLs in images
      Object.keys(safeImages).forEach(key => {
        if (Array.isArray(safeImages[key])) {
          safeImages[key] = safeImages[key].map(img => {
            if (img.url && img.url.startsWith('file:')) {
              return { ...img, url: fileMap[img.url] || img.url };
            }
            return img;
          });
        }
      });

      const hasAny = Object.values(safeImages).some(arr => Array.isArray(arr) && arr.length > 0);
      if (!hasAny) continue;

      const kv = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
        published: false,
        title: item.title || '',
        date: item.date || new Date().toISOString().slice(0, 10),
        designer: item.designer || '',
        region: item.region || 'GLOBAL',
        level: item.level || 'TOP',
        imageUrl: item.imageUrl || (safeImages.kv?.[0]?.url || ''),
        isIP: !!item.isIP,
        type: 'Key Visual',
        gameplay: '',
        figmaUrl: item.figmaUrl || '',
        categories: {
          ...(item.categories || {}),
          ipCampaign: item.isIP ? 'IP' : (item.categories?.ipCampaign || 'NonIP'),
        },
        images: safeImages,
      };
      db.kvs.unshift(kv);
      imported.push({ id: kv.id, title: kv.title });
    }

    writeDB(db);
    res.json({ imported: imported.length, items: imported });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import preview items: ' + error.message });
  }
});

// POST a new KV (defaults to unpublished)
app.post('/api/kvs', (req, res) => {
  try {
    const db = readDB();
    const newKV = {
      id: Date.now().toString(),
      published: false,
      ...req.body
    };
    db.kvs.unshift(newKV);
    writeDB(db);
    res.status(201).json(newKV);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save KV' });
  }
});

// PATCH toggle publish status
app.patch('/api/kvs/:id/publish', (req, res) => {
  try {
    const db = readDB();
    const kv = db.kvs.find(k => k.id === req.params.id);
    if (!kv) return res.status(404).json({ error: 'KV not found' });
    kv.published = !kv.published;
    writeDB(db);
    res.json({ id: kv.id, published: kv.published });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle publish status' });
  }
});

// PUT (update) an existing KV
app.put('/api/kvs/:id', (req, res) => {
  try {
    const db = readDB();
    const index = db.kvs.findIndex(k => k.id === req.params.id);
    if (index !== -1) {
      db.kvs[index] = { ...db.kvs[index], ...req.body, id: req.params.id };
      writeDB(db);
      res.json(db.kvs[index]);
    } else {
      res.status(404).json({ error: 'KV not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update KV' });
  }
});

// DELETE a KV
app.delete('/api/kvs/:id', (req, res) => {
  try {
    const db = readDB();
    const index = db.kvs.findIndex(k => k.id === req.params.id);
    if (index !== -1) {
      db.kvs.splice(index, 1);
      writeDB(db);
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'KV not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete KV' });
  }
});

app.listen(PORT, () => {
  console.log(`CMS Backend is running on http://localhost:${PORT}`);
});

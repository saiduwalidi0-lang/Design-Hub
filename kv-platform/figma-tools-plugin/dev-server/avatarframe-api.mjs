import http from 'node:http';
import { PNG } from 'pngjs';

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function dataUrlFromPng(png) {
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function rgba(r, g, b, a = 255) {
  return { r, g, b, a };
}

function fill(png, color) {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (png.width * y + x) << 2;
      png.data[i] = color.r;
      png.data[i + 1] = color.g;
      png.data[i + 2] = color.b;
      png.data[i + 3] = color.a;
    }
  }
}

function drawRect(png, x0, y0, w, h, color) {
  const x1 = Math.min(png.width, Math.max(0, x0 + w));
  const y1 = Math.min(png.height, Math.max(0, y0 + h));
  const xs = Math.min(png.width, Math.max(0, x0));
  const ys = Math.min(png.height, Math.max(0, y0));
  for (let y = ys; y < y1; y += 1) {
    for (let x = xs; x < x1; x += 1) {
      const i = (png.width * y + x) << 2;
      png.data[i] = color.r;
      png.data[i + 1] = color.g;
      png.data[i + 2] = color.b;
      png.data[i + 3] = color.a;
    }
  }
}

function makeElementPng(w, h, baseColor, accentColor) {
  const png = new PNG({ width: w, height: h });
  fill(png, rgba(0, 0, 0, 0));
  drawRect(png, 0, 0, w, h, rgba(baseColor.r, baseColor.g, baseColor.b, 40));
  const pad = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  drawRect(png, pad, pad, w - pad * 2, h - pad * 2, rgba(accentColor.r, accentColor.g, accentColor.b, 180));
  return png;
}

function scaleBox(box, sx, sy) {
  return {
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    width: Math.round(box.width * sx),
    height: Math.round(box.height * sy),
  };
}

/** boxes 为 Figma 270 画布坐标；composite 为 target×target 时先按比例放大框 */
function makeCompositePng(targetSize, boxesLogical, images, scaleFromFigma = { w: 270, h: 270 }) {
  const png = new PNG({ width: targetSize, height: targetSize });
  fill(png, rgba(0, 0, 0, 0));
  const sx = targetSize / Math.max(1, scaleFromFigma.w);
  const sy = targetSize / Math.max(1, scaleFromFigma.h);
  const boxes = {};
  for (const id of ['element1', 'element2', 'element3']) {
    if (boxesLogical[id]) boxes[id] = scaleBox(boxesLogical[id], sx, sy);
  }
  const order = ['element2', 'element1', 'element3'];
  for (const id of order) {
    const box = boxes[id];
    const src = images[id];
    if (!box || !src || box.width < 1 || box.height < 1) continue;
    const srcPng = PNG.sync.read(Buffer.from(src, 'base64'));
    const sw = srcPng.width;
    const sh = srcPng.height;
    for (let y = 0; y < box.height; y += 1) {
      for (let x = 0; x < box.width; x += 1) {
        const tx = box.x + x;
        const ty = box.y + y;
        if (tx < 0 || ty < 0 || tx >= png.width || ty >= png.height) continue;
        const px = Math.min(sw - 1, Math.max(0, Math.round((x / box.width) * (sw - 1))));
        const py = Math.min(sh - 1, Math.max(0, Math.round((y / box.height) * (sh - 1))));
        const si = (sw * py + px) << 2;
        const sr = srcPng.data[si];
        const sg = srcPng.data[si + 1];
        const sb = srcPng.data[si + 2];
        const sa = srcPng.data[si + 3] / 255;
        if (sa <= 0) continue;
        const di = (png.width * ty + tx) << 2;
        const dr = png.data[di];
        const dg = png.data[di + 1];
        const db = png.data[di + 2];
        const da = png.data[di + 3] / 255;
        const oa = sa + da * (1 - sa);
        const or = Math.round((sr * sa + dr * da * (1 - sa)) / Math.max(1e-6, oa));
        const og = Math.round((sg * sa + dg * da * (1 - sa)) / Math.max(1e-6, oa));
        const ob = Math.round((sb * sa + db * da * (1 - sa)) / Math.max(1e-6, oa));
        png.data[di] = or;
        png.data[di + 1] = og;
        png.data[di + 2] = ob;
        png.data[di + 3] = Math.round(oa * 255);
      }
    }
  }
  return png;
}

// 与 cms-admin / CMS 的 3001 错开；插件默认 baseUrl 为 http://localhost:3010
const PORT = 3010;

/** 与 banner-expand-tool/public/avatar-frame-defaults/defaults.json 对齐（供 GET default-config） */
const EMBEDDED_DEFAULT_CONFIG = {
  defaultGroupId: 'group-1',
  groups: [
    {
      id: 'group-1',
      name: '默认组（奖杯）',
      thumbnail: 'thumbs/group-1.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'surround.png' },
        element3: { src: 'top.png' },
      },
    },
    {
      id: 'group-2',
      name: '第二组',
      thumbnail: 'thumbs/group-2.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-2/surround.png' },
        element3: { src: 'sets/group-2/top.png' },
      },
    },
    {
      id: 'group-3',
      name: '第三组',
      thumbnail: 'thumbs/group-3.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-3/surround.png' },
        element3: { src: 'sets/group-3/top.png' },
      },
    },
    {
      id: 'group-4',
      name: '第四组',
      thumbnail: 'thumbs/group-4.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-4/surround.png' },
        element3: { src: 'sets/group-4/top.png' },
      },
    },
    {
      id: 'group-5',
      name: '第五组',
      thumbnail: 'thumbs/group-5.png',
      order: ['element2', 'element3', 'element1'],
      elements: {
        element1: { src: 'main.png' },
        element2: { src: 'sets/group-5/surround.png' },
        element3: { src: 'sets/group-5/top.png' },
      },
    },
  ],
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/avatar-frame/default-config') {
    sendJson(res, 200, EMBEDDED_DEFAULT_CONFIG);
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/avatar-frame/generate') {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const spec = body?.spec;
    const target = spec?.targetFrame?.width || 1024;
    const ff = spec?.figmaFrame || { width: 270, height: 270 };
    const def = {
      element1: { x: 87, y: 171, width: 96, height: 96 },
      element2: { x: 15, y: 171, width: 240, height: 96 },
      element3: { x: 75, y: 3, width: 120, height: 42 },
    };
    const raw = spec?.boxes || {};
    const boxes = {
      element1: raw.element1 || def.element1,
      element2: raw.element2 || def.element2,
      element3: raw.element3 !== undefined && raw.element3 !== null ? raw.element3 : { x: 0, y: 0, width: 0, height: 0 },
    };

    const e1 = makeElementPng(boxes.element1.width, boxes.element1.height, rgba(255, 64, 64), rgba(255, 180, 64));
    const e2 = makeElementPng(boxes.element2.width, boxes.element2.height, rgba(64, 128, 255), rgba(64, 220, 255));
    const e3 =
      boxes.element3.width > 0 && boxes.element3.height > 0
        ? makeElementPng(boxes.element3.width, boxes.element3.height, rgba(144, 64, 255), rgba(255, 64, 200))
        : (() => {
            const p = new PNG({ width: 1, height: 1 });
            fill(p, rgba(0, 0, 0, 0));
            return p;
          })();

    const element1DataUrl = dataUrlFromPng(e1);
    const element2DataUrl = dataUrlFromPng(e2);
    const element3DataUrl = dataUrlFromPng(e3);

    const images = {
      element1: Buffer.from(element1DataUrl.split(',')[1] || '', 'base64').toString('base64'),
      element2: Buffer.from(element2DataUrl.split(',')[1] || '', 'base64').toString('base64'),
      element3: Buffer.from(element3DataUrl.split(',')[1] || '', 'base64').toString('base64'),
    };

    const composite = makeCompositePng(target, boxes, images, { w: ff.width || 270, h: ff.height || 270 });
    const compositeDataUrl = dataUrlFromPng(composite);

    sendJson(res, 200, { element1DataUrl, element2DataUrl, element3DataUrl, compositeDataUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { error: msg });
  }
});

server.listen(PORT, '127.0.0.1');
process.stdout.write(`AvatarFrame API listening on http://localhost:${PORT}/api/avatar-frame/generate\n`);


#!/usr/bin/env node
/**
 * Figma Batch Crawl & Auto-Tag Script
 *
 * Usage:
 *   node crawl.js                          # uses ./crawl-config.json
 *   node crawl.js --config my-config.json  # uses custom config
 *   node crawl.js --token figd_xxx         # override token from CLI
 *
 * Output:
 *   ./output/manifest.json   — ready for CMS batch import
 *   ./output/images/         — all exported PNGs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ── CLI args ──
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i += 2) {
  if (args[i]?.startsWith('--')) argMap[args[i].slice(2)] = args[i + 1];
}

const configPath = path.resolve(argMap.config || './crawl-config.json');
if (!fs.existsSync(configPath)) {
  console.error(`❌ Config file not found: ${configPath}`);
  console.error('   Create one from crawl-config.json template');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const TOKEN = argMap.token || config.figmaToken;
const SCALE = config.imageScale || 2;
const FORMAT = config.imageFormat || 'png';
const OUTPUT_DIR = path.resolve(path.dirname(configPath), config.outputDir || './output');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');

if (!TOKEN || TOKEN.includes('在这里填入')) {
  console.error('❌ Please set your Figma token in crawl-config.json or pass --token figd_xxx');
  process.exit(1);
}

if (config.files.length === 0) {
  console.error('❌ No files configured in crawl-config.json');
  process.exit(1);
}

// ── Constants for auto-tagging ──
const KNOWN_LEVELS = ['TOP', 'MATURE', 'MID', 'LOW'];
const KNOWN_REGIONS = ['GLOBAL', 'SEA', 'NEA', 'EU', 'MENA', 'LATAM', 'US', 'ANZ', 'CN'];
const ASSET_PATTERNS = [
  { regex: /Banner[_\-]?1029/i, type: 'banner1029x276' },
  { regex: /Banner[_\-]?750/i, type: 'banner750x500' },
  { regex: /Banner/i, type: 'banner1029x276' },
  { regex: /AvatarFrame|Avatar[_\-]?Frame|头像框/i, type: 'avatarFrame' },
  { regex: /Icon/i, type: 'icons' },
  { regex: /H5/i, type: 'h5' },
  { regex: /KV/i, type: 'kv' },
];
const AVATAR_TYPES = ['Creator', 'Viewer'];
const AVATAR_LEVELS = ['LV1', 'LV2', 'LV3&4', 'LV3', 'LV4'];

// ── Helpers ──
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'X-Figma-Token': TOKEN } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', reject);
  });
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function detectAssetType(frameName) {
  for (const p of ASSET_PATTERNS) {
    if (p.regex.test(frameName)) return p.type;
  }
  return 'kv';
}

function parseFrameName(name) {
  const parts = name.split(/[_\-\s]+/);
  let level = '', region = '', avatarType = '', avatarLevel = '';
  const titleParts = [];

  for (const part of parts) {
    const upper = part.toUpperCase();
    if (KNOWN_LEVELS.includes(upper) && !level) { level = upper; }
    else if (KNOWN_REGIONS.includes(upper) && !region) { region = upper; }
    else if (AVATAR_TYPES.some(t => t.toLowerCase() === part.toLowerCase())) { avatarType = part; }
    else if (AVATAR_LEVELS.some(l => l.toLowerCase() === upper)) { avatarLevel = part.toUpperCase().replace('LV3', 'LV3&4').replace('LV4', 'LV3&4'); }
    else if (!/^(KV|H5|Banner|Icon|AvatarFrame|Avatar|Frame|头像框|\d+x\d+)$/i.test(part)) {
      titleParts.push(part);
    }
  }

  return { level, region, title: titleParts.join(' '), avatarType, avatarLevel };
}

function parsePageName(name) {
  const parts = name.split(/[_\-\s]+/);
  let level = '', region = '';
  const titleParts = [];
  for (const part of parts) {
    const upper = part.toUpperCase();
    if (KNOWN_LEVELS.includes(upper) && !level) level = upper;
    else if (KNOWN_REGIONS.includes(upper) && !region) region = upper;
    else titleParts.push(part);
  }
  return { level, region, title: titleParts.join(' ') };
}

// ── Main ──
async function crawlFile(fileConfig) {
  const match = fileConfig.url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!match) { console.error(`  ⚠️  Invalid URL: ${fileConfig.url}`); return []; }
  const fileKey = match[1];

  console.log(`\n📂 Fetching file structure: ${fileKey}`);
  const fileData = await fetchJSON(`https://api.figma.com/v1/files/${fileKey}`);
  console.log(`   File: "${fileData.name}"`);

  // Collect all frames grouped by campaign (= page)
  const campaigns = [];

  for (const page of fileData.document.children) {
    if (!page.children || page.children.length === 0) continue;
    const pageParsed = parsePageName(page.name);

    const frames = page.children.filter(n =>
      n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'
    );
    if (frames.length === 0) continue;

    const campaignTitle = pageParsed.title || page.name;
    const campaign = {
      title: campaignTitle,
      region: pageParsed.region || fileConfig.defaultTags?.region || 'GLOBAL',
      level: pageParsed.level || fileConfig.defaultTags?.level || 'TOP',
      defaultTags: fileConfig.defaultTags || {},
      figmaFileUrl: `https://www.figma.com/file/${fileKey}`,
      frames: [],
    };

    for (const frame of frames) {
      const assetType = detectAssetType(frame.name);
      const parsed = parseFrameName(frame.name);

      campaign.frames.push({
        nodeId: frame.id,
        name: frame.name,
        assetType,
        parsedTitle: parsed.title,
        parsedLevel: parsed.level,
        parsedRegion: parsed.region,
        avatarType: parsed.avatarType || 'Creator',
        avatarLevel: parsed.avatarLevel || 'LV1',
      });
    }

    campaigns.push(campaign);
    console.log(`   Page "${page.name}" → ${frames.length} frames`);
  }

  // Export images
  const allNodeIds = campaigns.flatMap(c => c.frames.map(f => f.nodeId));
  if (allNodeIds.length === 0) return [];

  console.log(`\n🖼️  Exporting ${allNodeIds.length} images (scale=${SCALE}, format=${FORMAT})...`);

  const BATCH_SIZE = 50;
  const imageUrlMap = {};
  for (let i = 0; i < allNodeIds.length; i += BATCH_SIZE) {
    const batch = allNodeIds.slice(i, i + BATCH_SIZE);
    const ids = batch.join(',');
    const imgData = await fetchJSON(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${FORMAT}&scale=${SCALE}`
    );
    Object.assign(imageUrlMap, imgData.images || {});
    console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} images`);
  }

  // Download images and build manifest items
  const items = [];

  for (const campaign of campaigns) {
    const item = {
      title: campaign.title,
      date: new Date().toISOString().slice(0, 10),
      region: campaign.region,
      level: campaign.level,
      figmaUrl: campaign.figmaFileUrl,
      categories: { ...campaign.defaultTags },
      imageFileName: '',
      images: { kv: [], h5: [], banner1029x276: [], banner750x500: [], avatarFrame: [], icons: [] },
    };

    for (const frame of campaign.frames) {
      const imageUrl = imageUrlMap[frame.nodeId];
      if (!imageUrl) { console.log(`   ⚠️  No image for "${frame.name}"`); continue; }

      const fileName = sanitizeFilename(`${campaign.title}_${frame.name}`) + `.${FORMAT}`;
      const filePath = path.join(IMAGES_DIR, fileName);

      // Update parsed fields if available
      if (frame.parsedLevel && !item.level) item.level = frame.parsedLevel;
      if (frame.parsedRegion && !item.region) item.region = frame.parsedRegion;

      await downloadFile(imageUrl, filePath);
      process.stdout.write('.');

      if (frame.assetType === 'avatarFrame') {
        item.images.avatarFrame.push({
          fileName,
          type: frame.avatarType,
          level: frame.avatarLevel,
        });
      } else {
        item.images[frame.assetType].push(fileName);
      }
    }

    // Set main image to first KV
    if (item.images.kv.length > 0) {
      item.imageFileName = item.images.kv[0];
    }

    items.push(item);
    console.log(`\n   ✅ "${campaign.title}" — ${campaign.frames.length} assets`);
  }

  return items;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Figma Batch Crawl & Auto-Tag Script');
  console.log('═══════════════════════════════════════');
  console.log(`Config: ${configPath}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Files:  ${config.files.length}`);

  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const allItems = [];
  for (const fileConfig of config.files) {
    try {
      const items = await crawlFile(fileConfig);
      allItems.push(...items);
    } catch (err) {
      console.error(`\n❌ Failed to crawl ${fileConfig.url}: ${err.message}`);
    }
  }

  const manifest = { items: allItems };
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n═══════════════════════════════════════');
  console.log(`✅ Done! Crawled ${allItems.length} campaigns`);
  console.log(`   ${fs.readdirSync(IMAGES_DIR).length} images downloaded`);
  console.log(`\nOutput files:`);
  console.log(`   📄 ${manifestPath}`);
  console.log(`   📁 ${IMAGES_DIR}/`);
  console.log(`\nNext steps:`);
  console.log(`   1. Review manifest.json, fix any tags if needed`);
  console.log(`   2. Open CMS → Key Visuals → 批量导入`);
  console.log(`   3. Upload manifest.json + select all images from images/`);
  console.log(`   4. Preview & import`);
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }

    const key = a.slice(2);
    const next = argv[i + 1];
    const hasValue = next != null && !next.startsWith('--');

    if (!hasValue) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function buildUrl(baseUrl, path, query) {
  const u = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function feishuRequest({ baseUrl, token, method, path, query, body }) {
  const url = buildUrl(baseUrl, path, query);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} ${resp.statusText}`);
    err.details = json;
    throw err;
  }

  if (json && typeof json.code === 'number' && json.code !== 0) {
    const err = new Error(`Feishu API error: code=${json.code} msg=${json.msg || ''}`.trim());
    err.details = json;
    throw err;
  }

  return json;
}

async function getTenantAccessToken({ baseUrl, appId, appSecret }) {
  const json = await feishuRequest({
    baseUrl,
    method: 'POST',
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    body: {
      app_id: appId,
      app_secret: appSecret
    }
  });

  const token = json?.tenant_access_token;
  if (!token) {
    const err = new Error('无法获取 tenant_access_token');
    err.details = json;
    throw err;
  }
  return token;
}

async function createDocxDocument({ baseUrl, token, title, folderToken }) {
  const body = { title };
  if (folderToken) body.folder_token = folderToken;
  const json = await feishuRequest({
    baseUrl,
    token,
    method: 'POST',
    path: '/open-apis/docx/v1/documents',
    body
  });
  const data = json?.data;
  return {
    documentId: data?.document?.document_id || data?.document_id,
    url: data?.document?.url || data?.url
  };
}

async function getAllBlocks({ baseUrl, token, documentId }) {
  const blocks = [];
  let pageToken;

  for (let i = 0; i < 50; i += 1) {
    const json = await feishuRequest({
      baseUrl,
      token,
      method: 'GET',
      path: `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks`,
      query: {
        page_size: 500,
        page_token: pageToken
      }
    });

    const items = json?.data?.items || json?.data?.blocks || [];
    for (const b of items) blocks.push(b);

    pageToken = json?.data?.page_token;
    if (!pageToken) break;
  }

  return blocks;
}

function pickRootBlockId({ documentId, blocks }) {
  const candidates = blocks.filter((b) => !b.parent_id && !b.parent_block_id);
  const page = candidates.find((b) => b.block_type === 1 || b.type === 'page' || b.block_type === 'page');
  if (page?.block_id) return page.block_id;
  const anyRoot = candidates[0];
  if (anyRoot?.block_id) return anyRoot.block_id;
  return documentId;
}

async function convertMarkdownToBlocks({ baseUrl, token, content, contentType }) {
  const json = await feishuRequest({
    baseUrl,
    token,
    method: 'POST',
    path: '/open-apis/docx/v1/documents/blocks/convert',
    body: {
      content,
      content_type: contentType
    }
  });

  const blocks = json?.data?.blocks || json?.data?.children || json?.data?.items;
  if (!Array.isArray(blocks)) {
    const err = new Error('转换接口未返回 blocks 数组');
    err.details = json;
    throw err;
  }
  return blocks;
}

async function createNestedBlocks({ baseUrl, token, documentId, parentBlockId, children, documentRevisionId }) {
  const json = await feishuRequest({
    baseUrl,
    token,
    method: 'POST',
    path: `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(parentBlockId)}/descendant`,
    query: {
      document_revision_id: documentRevisionId ?? -1
    },
    body: {
      children
    }
  });

  return json?.data;
}

function printHelp() {
  const text = [
    'feishu-doc-writer',
    '',
    '用法：',
    '  node scripts/feishu-doc-writer/index.mjs --title "标题" --markdown-file ./content.md',
    '  node scripts/feishu-doc-writer/index.mjs --document-id doxcnxxx --markdown-file ./content.md',
    '',
    '参数：',
    '  --title <string>           创建新文档的标题（不传 --document-id 时必填）',
    '  --document-id <string>     写入到已有文档（追加）',
    '  --folder-token <string>    新文档放到指定文件夹（可选）',
    '  --markdown-file <path>     读取 Markdown 文件',
    '  --markdown <string>        直接传 Markdown 内容',
    '  --stdin                    从 stdin 读取 Markdown',
    '  --content-type <string>    markdown 或 html（默认 markdown）',
    '  --debug                    输出调试信息',
    '  --help                     显示帮助',
    '',
    '环境变量：',
    '  FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BASE_URL(可选)'
  ].join('\n');

  process.stdout.write(`${text}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const baseUrl = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn';
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('缺少环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET');
  }

  const contentType = args['content-type'] || 'markdown';
  const folderToken = args['folder-token'];
  const title = args.title;
  const documentIdFromArg = args['document-id'];
  const debug = Boolean(args.debug);

  const markdown = args.markdown
    ? String(args.markdown)
    : args['markdown-file']
      ? await fs.readFile(String(args['markdown-file']), 'utf8')
      : args.stdin
        ? await readStdin()
        : null;

  if (!markdown) {
    throw new Error('缺少内容：请提供 --markdown / --markdown-file / --stdin');
  }

  if (!documentIdFromArg && !title) {
    throw new Error('创建新文档需要 --title，或使用 --document-id 写入已有文档');
  }

  const token = await getTenantAccessToken({ baseUrl, appId, appSecret });
  const blocks = await convertMarkdownToBlocks({ baseUrl, token, content: markdown, contentType });

  let documentId = documentIdFromArg;
  let url;
  if (!documentId) {
    const created = await createDocxDocument({ baseUrl, token, title, folderToken });
    documentId = created.documentId;
    url = created.url;
    if (!documentId) throw new Error('创建文档后未获得 document_id');
  }

  const docBlocks = await getAllBlocks({ baseUrl, token, documentId });
  const rootBlockId = pickRootBlockId({ documentId, blocks: docBlocks });

  if (debug) {
    process.stderr.write(`documentId=${documentId}\n`);
    process.stderr.write(`rootBlockId=${rootBlockId}\n`);
    process.stderr.write(`convertedBlocks=${blocks.length}\n`);
  }

  await createNestedBlocks({
    baseUrl,
    token,
    documentId,
    parentBlockId: rootBlockId,
    children: blocks,
    documentRevisionId: -1
  });

  const out = {
    document_id: documentId,
    url
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  const msg = err?.message ? String(err.message) : String(err);
  process.stderr.write(`${msg}\n`);
  if (err?.details) {
    process.stderr.write(`${JSON.stringify(err.details, null, 2)}\n`);
  }
  process.exitCode = 1;
});


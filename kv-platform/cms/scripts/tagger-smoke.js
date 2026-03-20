try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch {}

const baseUrl = String(process.env.API_BASE_URL || process.env.VIVIAI_BASE_URL || 'https://api.viviai.cc')
  .trim()
  .replace(/`/g, '')
  .replace(/^"|"$/g, '')
  .replace(/^'|'$/g, '')
  .replace(/\/+$/g, '');

const apiKey = String(process.env.API_KEY || process.env.VIVIAI_API_KEY || '').trim();
const model = String(process.env.MODEL_ID || process.env.VIVIAI_MODEL || 'gemini-3-pro-preview').trim();

async function main() {
  if (!apiKey) {
    console.error('Missing API_KEY');
    process.exit(1);
  }

  const endpoint = `${baseUrl}/v1/chat/completions`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Return ONLY JSON: {"categories":{"theme":"节日"}}' },
        { role: 'user', content: 'test' },
      ],
    }),
  });

  const text = await resp.text();
  console.log('endpoint:', endpoint);
  console.log('model:', model);
  console.log('status:', resp.status);
  console.log(text.slice(0, 1200));
}

main().catch(err => {
  console.error(String(err?.stack || err));
  process.exit(1);
});

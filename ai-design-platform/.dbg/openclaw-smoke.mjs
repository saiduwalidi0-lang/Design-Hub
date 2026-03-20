import fs from 'node:fs'

function readGatewaySecret() {
  try {
    const raw = fs.readFileSync('d:/openclaw/config/openclaw.json', 'utf8')
    const json = JSON.parse(raw)
    const auth = json?.gateway?.auth
    const mode = auth?.mode
    if (mode === 'password' && typeof auth?.password === 'string') {
      return { mode, value: auth.password }
    }
    if (mode === 'token' && typeof auth?.token === 'string') {
      return { mode, value: auth.token }
    }
  } catch {
    return null
  }
  return null
}

async function post(url, headers) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
    }),
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, ok: res.ok, text }
}

const candidates = [
  'http://127.0.0.1:18789/v1/chat/completions',
  'http://127.0.0.1:18789/chat/completions',
]

const secret = readGatewaySecret()

for (const url of candidates) {
  try {
    const r1 = await post(url, {})
    process.stdout.write(`${url} no-auth -> ${r1.status} ${r1.ok ? 'ok' : 'not-ok'}\n`)
    if (r1.ok) continue

    if (r1.status === 401 || r1.status === 403) {
      const headers = secret?.value
        ? { authorization: `Bearer ${secret.value}` }
        : {}
      const r2 = await post(url, headers)
      process.stdout.write(`${url} with-auth -> ${r2.status} ${r2.ok ? 'ok' : 'not-ok'}\n`)
    }
  } catch (e) {
    process.stdout.write(`${url} -> ERROR ${e instanceof Error ? e.message : String(e)}\n`)
  }
}


const base = process.env.API_BASE ?? 'http://localhost:3002'

try {
  const res = await fetch(`${base}/api/ai/status`)
  const text = await res.text()
  process.stdout.write(`status=${res.status} ok=${res.ok}\n`)
  process.stdout.write(text + '\n')
} catch (e) {
  process.stdout.write(`error=${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
}


const urls = [
  'http://localhost:5173/',
  'http://localhost:5174/',
  'http://localhost:3002/api/tasks',
]

for (const u of urls) {
  try {
    const res = await fetch(u, {
      method: u.includes('/api/tasks') ? 'OPTIONS' : 'GET',
    })
    process.stdout.write(`${u} -> ${res.status} ${res.ok ? 'ok' : 'not-ok'}\n`)
  } catch (e) {
    process.stdout.write(`${u} -> ERROR ${e instanceof Error ? e.message : String(e)}\n`)
  }
}


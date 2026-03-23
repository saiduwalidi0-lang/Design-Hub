const id = process.argv[2]
if (!id) {
  process.stdout.write('Usage: node ./.dbg/gettask.mjs <taskId>\n')
  process.exit(1)
}

const base = process.env.API_BASE ?? 'http://localhost:5174'
const res = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}`)
const text = await res.text()

let json
try {
  json = JSON.parse(text)
} catch {
  process.stdout.write(`status=${res.status} non-json-body=${text.slice(0, 200)}\n`)
  process.exit(2)
}

process.stdout.write(`status=${res.status}\n`)
process.stdout.write(JSON.stringify(json, null, 2) + '\n')


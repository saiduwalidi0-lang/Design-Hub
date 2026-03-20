const id = process.argv[2]
if (!id) {
  process.stdout.write('Usage: node ./.dbg/showtopic.mjs <taskId>\n')
  process.exit(1)
}

const base = process.env.API_BASE ?? 'http://localhost:3002'
const res = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}`)
const json = await res.json()
const md = json?.task?.designSpecMarkdown ?? ''
const idx = md.indexOf('## 生成方式')
if (idx < 0) {
  process.stdout.write('no section\n')
  process.exit(0)
}
const slice = md.slice(idx, idx + 200)
process.stdout.write(slice.replace(/\n/g, '\\n') + '\n')

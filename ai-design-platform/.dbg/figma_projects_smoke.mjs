const res = await fetch('http://localhost:3002/api/figma/projects')
process.stdout.write(`status=${res.status}\n`)
const text = await res.text().catch(() => '')
process.stdout.write(text.slice(0, 800) + '\n')


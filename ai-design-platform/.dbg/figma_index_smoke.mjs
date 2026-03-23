const start = await fetch('http://localhost:3002/api/figma/index/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ maxAnalyze: 5, concurrency: 1 }),
})

process.stdout.write(`start_status=${start.status}\n`)
process.stdout.write((await start.text()) + '\n')

const status = await fetch('http://localhost:3002/api/figma/index/status')
process.stdout.write(`status_status=${status.status}\n`)
process.stdout.write((await status.text()) + '\n')


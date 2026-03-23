const stop = await fetch('http://localhost:3002/api/figma/index/stop', { method: 'POST' })
process.stdout.write(`stop_status=${stop.status}\n`)
process.stdout.write((await stop.text()) + '\n')


import net from 'node:net'

const host = process.argv[2] ?? '127.0.0.1'
const port = Number(process.argv[3] ?? '18789')

const socket = net.createConnection({ host, port })
const started = Date.now()
let done = false
const timer = setTimeout(() => {
  if (done) return
  process.stdout.write(`${host}:${port} connect timeout\n`)
  process.exit(1)
}, 3000)

socket.on('connect', () => {
  done = true
  clearTimeout(timer)
  process.stdout.write(`${host}:${port} connect ok (${Date.now() - started}ms)\n`)
  socket.end()
})

socket.on('error', (e) => {
  done = true
  clearTimeout(timer)
  process.stdout.write(`${host}:${port} connect error: ${e.code ?? ''} ${e.message}\n`)
  process.exit(1)
})

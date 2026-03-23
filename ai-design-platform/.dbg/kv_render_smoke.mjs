const d =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO1bL7kAAAAASUVORK5CYII='

const res = await fetch('http://localhost:3002/api/kv/render', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    prompt: 'abstract poster, no text',
    imageSize: 'landscape_16_9',
    referenceImageDataUrl: d,
  }),
})

process.stdout.write(`status=${res.status}\n`)
process.stdout.write((await res.text()) + '\n')


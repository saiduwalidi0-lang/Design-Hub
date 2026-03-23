import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const apiKey = process.env.ARK_I2I_API_KEY
const model = process.env.ARK_I2I_MODEL
const base = (process.env.ARK_I2I_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
if (!apiKey || !model) {
  process.stdout.write('missing env ARK_I2I_API_KEY/ARK_I2I_MODEL\n')
  process.exit(1)
}

const url = `${base}/images/generations`

const dataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO1bL7kAAAAASUVORK5CYII='

const body = {
  model,
  prompt: 'keep similar composition, no text',
  image: [dataUrl],
  sequential_image_generation: 'disabled',
  response_format: 'url',
  size: '2K',
  stream: false,
  watermark: true,
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
})

process.stdout.write(`status=${res.status}\n`)
process.stdout.write((await res.text()) + '\n')


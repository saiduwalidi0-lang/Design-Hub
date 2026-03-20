import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

const baseUrl = (process.env.AI_BASE_URL ?? '').replace(/\/$/, '')
const model = process.env.AI_MODEL ?? ''
const apiKey = process.env.AI_API_KEY ?? ''

if (!baseUrl || !model || !apiKey) {
  process.stdout.write('missing AI_BASE_URL or AI_MODEL or AI_API_KEY\n')
  process.exit(1)
}

const url = `${baseUrl}/chat/completions`

const res = await fetch(url, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'ping' }],
    temperature: 0,
  }),
})

const text = await res.text().catch(() => '')
process.stdout.write(`status=${res.status} ok=${res.ok}\n`)
process.stdout.write(text.slice(0, 800) + '\n')


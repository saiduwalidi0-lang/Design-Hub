import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const base = (process.env.ARK_VISION_BASE_URL || '').replace(/\/+$/, '')
const model = process.env.ARK_VISION_MODEL
const apiKey = process.env.ARK_VISION_API_KEY

if (!base || !model || !apiKey) {
  process.stdout.write('missing ARK_VISION_* env\n')
  process.exit(1)
}

const url = `${base}/responses`

const body = {
  model,
  input: [
    {
      role: 'user',
      content: [
        {
          type: 'input_image',
          image_url: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png',
        },
        { type: 'input_text', text: '请用一句话描述图片，并给出5个关键词。' },
      ],
    },
  ],
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
})

const raw = await res.text().catch(() => '')
process.stdout.write(`status=${res.status}\n`)
process.stdout.write(raw.slice(0, 2000) + '\n')


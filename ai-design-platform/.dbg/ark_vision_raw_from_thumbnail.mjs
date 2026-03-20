import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })

const base = (process.env.ARK_VISION_BASE_URL || '').replace(/\/+$/, '')
const model = process.env.ARK_VISION_MODEL
const apiKey = process.env.ARK_VISION_API_KEY
const style = (process.env.ARK_VISION_API_STYLE || 'responses').trim()

if (!base || !model || !apiKey) {
  process.stdout.write('missing ARK_VISION_* env\n')
  process.exit(1)
}

const thumb =
  'https://s3-alpha.figma.com/thumbnails/11cba235-e169-4838-a7d5-cc91a553cc7b?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQ4GOSFWCVLWKB6UZ%2F20260312%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260312T000000Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=88537da6a66025dba7835b555dd5fcacd1fe3a72916a16558c3d20cee962ac32'

const imgRes = await fetch(thumb)
process.stdout.write(`img_status=${imgRes.status}\n`)
const ct = imgRes.headers.get('content-type') || 'image/jpeg'
const ab = await imgRes.arrayBuffer()
const b64 = Buffer.from(new Uint8Array(ab)).toString('base64')
const dataUrl = `data:${ct};base64,${b64}`

const prompt =
  'You are looking at a design thumbnail. Extract rich, multi-dimensional information. Output in English in the exact labeled format below (single paragraph per label, keep concise, total < 1800 chars, no Markdown):\n' +
  'Design Type: <KV/poster/banner/landing page/popup/feed card/etc.>\n' +
  'Main Title Design: <if any title-like text appears, describe its style; otherwise write N/A>\n' +
  'Composition Method: <layout structure, hierarchy, focal area, whitespace, balance>\n' +
  'Key Elements: <subject/background/decorations/icons/3D objects>\n' +
  'Color & Lighting: <palette, contrast, mood, highlight strategy>\n' +
  'Texture & Material: <materials, rendering style, realism/CG, grain, gloss>\n' +
  'Font Design: <typeface traits, weight, geometry, special treatments; or N/A>\n' +
  'Content Generation Rules: <what must be preserved, what to avoid, stylistic constraints>\n' +
  'Keywords: <12-18 keywords>'

const url = style === 'chat' ? `${base}/chat/completions` : `${base}/responses`
const body =
  style === 'chat'
    ? {
        model,
        temperature: 0.2,
        max_tokens: 900,
        stream: false,
        messages: [
          { role: 'system', content: 'Return only the labeled fields. No Markdown.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }
    : {
        model,
        temperature: 0.2,
        max_output_tokens: 900,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_image', image_url: dataUrl },
              { type: 'input_text', text: prompt },
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
process.stdout.write(`ark_status=${res.status}\n`)
process.stdout.write(raw.slice(0, 4000) + '\n')


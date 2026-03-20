import { searchReferenceImages } from '../api/services/wikimediaSearch.js'

const main = async () => {
  const startedAt = Date.now()
  const q =
    (process.env.Q ?? '').trim() ||
    process.argv.slice(2).join(' ').trim() ||
    'Machu Picchu terraces'
  const res = await searchReferenceImages(q, 6)
  process.stdout.write(`done in ${Date.now() - startedAt}ms\n`)
  process.stdout.write(`q=${q}\n`)
  process.stdout.write(`images=${res.images.length}\n`)
  process.stdout.write(JSON.stringify(res.debug, null, 2) + '\n')
}

void main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e?.message ?? e) + '\n')
  process.exit(1)
})

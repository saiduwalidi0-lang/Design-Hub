const q = process.argv.slice(2).join(' ') || 'Machu Picchu terraces'

const url = new URL('https://commons.wikimedia.org/w/api.php')
url.searchParams.set('action', 'query')
url.searchParams.set('format', 'json')
url.searchParams.set('generator', 'search')
url.searchParams.set('gsrsearch', q)
url.searchParams.set('gsrnamespace', '6')
url.searchParams.set('gsrlimit', '6')
url.searchParams.set('prop', 'imageinfo')
url.searchParams.set('iiprop', 'url')
url.searchParams.set('iiurlwidth', '800')
url.searchParams.set('iiurlheight', '800')

const res = await fetch(url, { headers: { 'user-agent': 'ai-design-platform/0.1 (local dev)' } })
const json = await res.json().catch(() => null)
const pages = Object.values(json?.query?.pages ?? {})

process.stdout.write(`q=${q}\nstatus=${res.status} ok=${res.ok}\npages=${pages.length}\n`)
process.stdout.write(`example_titles=${pages.slice(0, 3).map((p) => p?.title).join(' | ')}\n`)


const url = process.argv[2]
if (!url) {
  process.stdout.write('usage: node ./.dbg/fetchinfo.mjs <url>\n')
  process.exit(1)
}

const res = await fetch(url, {
  headers: {
    accept: 'image/*,*/*;q=0.8',
  },
})

process.stdout.write(`status=${res.status}\n`)
process.stdout.write(`content-type=${res.headers.get('content-type') ?? ''}\n`)
process.stdout.write(`content-length=${res.headers.get('content-length') ?? ''}\n`)

const buf = await res.arrayBuffer()
process.stdout.write(`bytes=${buf.byteLength}\n`)


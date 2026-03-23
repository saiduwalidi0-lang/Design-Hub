import { fetchReferenceImagesFromUrls } from '../api/services/openGraph.js'

const urls = process.argv.slice(2)
const res = await fetchReferenceImagesFromUrls(urls, 4)
process.stdout.write(JSON.stringify(res, null, 2) + '\n')


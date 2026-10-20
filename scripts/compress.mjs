// Pre-compresses the built client (brotli + gzip) so the server can send the
// smallest file without spending CPU per request.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.resolve(process.argv[2] || 'dist')
const EXT = new Set(['.js', '.css', '.html', '.svg', '.json', '.wasm', '.txt', '.mjs'])
let before = 0
let after = 0

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (EXT.has(path.extname(p)) && fs.statSync(p).size > 1024) {
      const buf = fs.readFileSync(p)
      const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
      fs.writeFileSync(p + '.br', br)
      fs.writeFileSync(p + '.gz', zlib.gzipSync(buf, { level: 9 }))
      before += buf.length
      after += br.length
    }
  }
}

walk(root)
console.log(`[compress] ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB (brotli)`)

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { defineServer, defineRoom } from 'colyseus'
import { CoopRoom } from './CoopRoom.ts'
import { ROOM_NAME } from '../shared/protocol.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
const port = Number(process.env.PORT || 2567)

/** Hashed assets never change; the HTML must always be revalidated. */
function cacheHeaders(res: express.Response, file: string) {
  if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  else res.setHeader('Cache-Control', 'no-cache')
}

/** Serves the .br / .gz siblings written at build time (scripts/compress.mjs). */
function precompressed(root: string): express.RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const rel = req.path === '/' ? '/index.html' : decodeURIComponent(req.path)
    const file = path.join(root, rel)
    if (!file.startsWith(root + path.sep)) return next()
    const accept = String(req.headers['accept-encoding'] || '')
    for (const [enc, ext] of [['br', '.br'], ['gzip', '.gz']] as const) {
      if (!accept.includes(enc) || !fs.existsSync(file + ext)) continue
      res.setHeader('Content-Encoding', enc)
      res.setHeader('Vary', 'Accept-Encoding')
      res.type(path.extname(file))
      cacheHeaders(res, file)
      return res.sendFile(file + ext)
    }
    next()
  }
}

const server = defineServer({
  greet: false,
  rooms: { [ROOM_NAME]: defineRoom(CoopRoom) },
  express: (app) => {
    app.get('/health', (_req, res) => { res.json({ ok: true }) })
    // In production the same process serves the built client.
    if (fs.existsSync(dist)) {
      app.use(precompressed(dist))
      app.use(express.static(dist, { index: 'index.html', setHeaders: cacheHeaders }))
    }
  },
})

server.listen(port).then(() => {
  console.log(`[rusty-together] server listening on :${port}${fs.existsSync(dist) ? ' (serving dist/)' : ''}`)
})

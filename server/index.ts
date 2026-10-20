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

const server = defineServer({
  greet: false,
  rooms: { [ROOM_NAME]: defineRoom(CoopRoom) },
  express: (app) => {
    app.get('/health', (_req, res) => { res.json({ ok: true }) })
    // In production the same process serves the built client.
    if (fs.existsSync(dist)) {
      app.use(express.static(dist, { maxAge: '1h', index: 'index.html' }))
    }
  },
})

server.listen(port).then(() => {
  console.log(`[rusty-together] server listening on :${port}${fs.existsSync(dist) ? ' (serving dist/)' : ''}`)
})

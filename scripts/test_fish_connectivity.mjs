#!/usr/bin/env node
// Test 2: Fish Audio API connectivity + Arabic voice discovery
// Secrets loaded from .env, NEVER printed.
import fs from 'node:fs'

function loadEnv() {
  const raw = fs.readFileSync('/home/z/my-project/.env', 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}
loadEnv()

const KEY = process.env.FISH_AUDIO_API_KEY
const mask = (k) => (k ? `${k.slice(0, 7)}...${k.slice(-4)} (len=${k.length})` : 'MISSING')

async function main() {
  console.log('=== FISH AUDIO CONNECTIVITY TEST ===')
  console.log('key:', mask(KEY))
  const headers = {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  }

  // 1. Simple TTS with default voice, Arabic text (Saudi-flavored)
  const body = {
    text: 'يا أستاذ، أنا مو متأكد من الجواب، بس أعتقد إن الكسر يعني جزء من الكل.',
    format: 'mp3',
    mp3_bitrate: 128,
    normalize: true,
    latency: 'normal',
  }
  const t0 = Date.now()
  let res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { ...headers, model: 'speech-1.5' },
    body: JSON.stringify(body),
  })
  console.log('tts(default voice) status:', res.status, `${Date.now() - t0}ms`)
  console.log('content-type:', res.headers.get('content-type'))
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer())
    console.log('audio bytes:', buf.length, 'mp3 magic:', buf.slice(0, 3).toString('hex') === 'fffb' || buf.slice(0, 3).toString('hex').startsWith('fff') ? 'MP3 ok' : buf.slice(0, 4).toString('hex'))
    fs.writeFileSync('/home/z/my-project/scripts/out_fish_default.mp3', buf)
    console.log('saved scripts/out_fish_default.mp3')
  } else {
    const text = await res.text()
    console.log('tts error:', text.slice(0, 300))
  }

  // 2. Credit/usage check (if endpoint exists)
  res = await fetch('https://api.fish.audio/wallet/api/credit', { headers })
  console.log('credit status:', res.status)
  if (res.ok) console.log('credit:', (await res.text()).slice(0, 200))

  // 3. Discover Arabic voices via model listing
  //    POST /model with pagination + language filter
  res = await fetch('https://api.fish.audio/model', {
    method: 'POST',
    headers,
    body: JSON.stringify({ page_size: 20, page_num: 1, language: 'Arabic', sort_by: 'task_count' }),
  })
  console.log('model search (language=Arabic) status:', res.status)
  if (res.ok) {
    const j = await res.json()
    console.log('total:', j.total, 'items:', (j.items || []).length)
    for (const it of (j.items || []).slice(0, 10)) {
      console.log(`  voice: ${it._id} | title: ${(it.title || '').slice(0, 60)} | lang: ${it.language} | likes: ${it.like_count ?? '-'}`)
    }
  } else {
    console.log('model search error:', (await res.text()).slice(0, 200))
  }

  console.log('=== FISH AUDIO TEST DONE ===')
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})

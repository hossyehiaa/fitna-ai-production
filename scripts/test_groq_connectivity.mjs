#!/usr/bin/env node
// Test 1: Groq API connectivity — chat completions (student-response engine)
// Secrets are loaded from .env and NEVER printed.
import fs from 'node:fs'

function loadEnv() {
  const raw = fs.readFileSync('/home/z/my-project/.env', 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}
loadEnv()

const KEY = process.env.GROQ_API_KEY
const mask = (k) => (k ? `${k.slice(0, 5)}...${k.slice(-4)} (len=${k.length})` : 'MISSING')

async function main() {
  console.log('=== GROQ CONNECTIVITY TEST ===')
  console.log('key:', mask(KEY))

  // 1. Chat completion — dialect-aware student reaction style
  const body = {
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content:
          'أنت طالب سعودي اسمه عمر في صف مدرسي. رد دائماً باللهجة السعودية الطبيعية فقط. أخرج JSON فقط بالشكل {"text": "..."}',
      },
      { role: 'user', content: 'نص كلام المعلم: <<<.teacher>>> السلام عليكم، من يشرح لي ما هو الكسور؟ <<<>>>' },
    ],
  }
  const t0 = Date.now()
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  console.log('chat status:', res.status, `${Date.now() - t0}ms`)
  const json = await res.json()
  if (!res.ok) {
    console.log('chat error body keys:', Object.keys(json), json.error?.message?.slice(0, 200))
    process.exit(1)
  }
  console.log('model:', json.model)
  console.log('usage:', JSON.stringify(json.usage))
  const content = json.choices?.[0]?.message?.content
  console.log('content (first 300 chars):', (content || '').slice(0, 300))

  // 2. Models list (verify whisper-large-v3 available)
  const mres = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${KEY}` },
  })
  const mjson = await mres.json()
  const ids = (mjson.data || []).map((m) => m.id)
  console.log('models status:', mres.status)
  console.log('whisper-large-v3 available:', ids.includes('whisper-large-v3'))
  console.log('llama-3.3-70b-versatile available:', ids.includes('llama-3.3-70b-versatile'))
  console.log('=== GROQ TEST DONE ===')
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})

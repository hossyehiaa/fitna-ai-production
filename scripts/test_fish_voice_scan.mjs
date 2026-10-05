#!/usr/bin/env node
// Scan Fish Audio Arabic voice library for student-persona voices (young male/female).
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

async function page(p) {
  const res = await fetch(
    `https://api.fish.audio/model?language=ar&page_size=100&page_num=${p}&sort_by=task_count`,
    { headers: { Authorization: `Bearer ${KEY}` } }
  )
  if (!res.ok) throw new Error(`page ${p} status ${res.status}`)
  const j = await res.json()
  return j.items || []
}

async function main() {
  const all = []
  for (let p = 1; p <= 5; p++) {
    const items = await page(p)
    all.push(...items)
    if (items.length < 100) break
  }
  console.log(`scanned ${all.length} Arabic voices`)
  const scored = all.map((it) => {
    const tags = (it.tags || []).map((t) => String(t).toLowerCase())
    return {
      id: it._id,
      title: (it.title || '').slice(0, 40),
      female: tags.includes('female'),
      male: tags.includes('male'),
      young: tags.some((t) => ['young', 'child', 'kid', 'teen', 'youth', 'girl', 'boy'].includes(t)),
      tags: (it.tags || []).slice(0, 8).join(','),
      tasks: it.task_count ?? 0,
      likes: it.like_count ?? 0,
      quality: it.quality,
    }
  })
  const female = scored.filter((v) => v.female).sort((a, b) => b.tasks - a.tasks).slice(0, 12)
  const male = scored.filter((v) => v.male).sort((a, b) => b.tasks - a.tasks).slice(0, 12)
  const young = scored.filter((v) => v.young).sort((a, b) => b.tasks - a.tasks).slice(0, 12)
  console.log('\n=== TOP FEMALE (by tasks) ===')
  female.forEach((v) => console.log(`${v.id} | ${v.title} | tasks=${v.tasks} likes=${v.likes} q=${v.quality} | ${v.tags}`))
  console.log('\n=== TOP MALE (by tasks) ===')
  male.forEach((v) => console.log(`${v.id} | ${v.title} | tasks=${v.tasks} likes=${v.likes} q=${v.quality} | ${v.tags}`))
  console.log('\n=== YOUNG/CHILD TAGGED ===')
  young.forEach((v) => console.log(`${v.id} | ${v.title} | ${v.female ? 'F' : 'M'} | tasks=${v.tasks} | ${v.tags}`))
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })

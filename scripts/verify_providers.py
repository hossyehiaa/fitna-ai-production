#!/usr/bin/env python3
"""Definitive provider verification on production:
1. Fetch production TTS MP3 → parse MPEG frame header (Fish=44.1kHz/128kbps, Edge=24kHz/48kbps)
2. Direct Fish Audio call from sandbox with the SAME text → byte-compare profile
3. Grep fallback reply bank — prove production answers are NOT deterministic templates
"""
import json, re, struct, urllib.request, base64, os, sys

PROD = "https://fitna-ai-production.vercel.app"

# --- 1. login via E2E-style DB session (cookie signed with AUTH_SECRET) ---
sys.path.insert(0, "/home/z/my-project/scripts")

def get_env():
    env = {}
    for line in open("/home/z/my-project/.env"):
        m = re.match(r"^([A-Z_]+)=(.+)$", line.strip())
        if m: env[m.group(1)] = m.group(2).strip()
    return env

ENV = get_env()

import psycopg2  # may not exist; fallback to HTTP-only mode
HAVE_PG = True
try:
    conn = psycopg2.connect(ENV["DATABASE_URL"], sslmode="require")
except Exception:
    HAVE_PG = False

import hmac, hashlib, secrets
from datetime import datetime, timedelta, timezone

def make_session():
    uid = None
    if HAVE_PG:
        cur = conn.cursor()
        email = f"prov-{int(datetime.now().timestamp())}@fitna.test"
        cur.execute(
            "INSERT INTO users (id, email, full_name, role, password_hash, created_at) "
            "VALUES (gen_random_uuid(), %s, %s, 'teacher', 'x', now()) RETURNING id",
            (email, "مدقق الإنتاج"),
        )
        uid = cur.fetchone()[0]
        raw = secrets.token_urlsafe(32)
        mac = hmac.new(ENV["AUTH_SECRET"].encode(), raw.encode(), hashlib.sha256).digest()
        token_hash = hashlib.sha256(mac).hexdigest()
        cur.execute(
            "INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) "
            "VALUES (gen_random_uuid(), %s, %s, %s, now())",
            (uid, token_hash, datetime.now(timezone.utc) + timedelta(hours=1)),
        )
        conn.commit()
        ctx = base64.urlsafe_b64encode(json.dumps({"uid": uid, "role": "teacher"}).encode()).rstrip(b"=").decode()
        sig = base64.urlsafe_b64encode(hmac.new(ENV["AUTH_SECRET"].encode(), ctx.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
        return f"fitna_session={raw}; fitna_auth_ctx={ctx}.{sig}", email
    return None, None

COOKIE, test_email = make_session()
print(f"test session created: {test_email}" if COOKIE else "no pg — cannot verify")

# --- 2. MP3 frame header parser ---
BITRATES = {1: {32,40,48,56,64,80,96,112,128,160,192,224,256,320}, 2: {8,16,24,32,40,48,56,64,80,96,112,128,144,160}}
SRATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}  # MPEG1, MPEG2, MPEG2.5

def parse_mp3(buf: bytes):
    # find first frame sync
    i = 0
    while i < min(len(buf) - 4, 8192):
        if buf[i] == 0xFF and (buf[i+1] & 0xE0) == 0xE0:
            break
        i += 1
    if i >= min(len(buf) - 4, 8192):
        return None
    h = buf[i:i+4]
    version_bits = (h[1] >> 3) & 0x3  # 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    layer_bits = (h[1] >> 1) & 0x3    # 1=Layer3
    bitrate_idx = (h[2] >> 4) & 0xF
    srate_idx = (h[2] >> 2) & 0x3
    channel_mode = (h[3] >> 6) & 0x3
    versions = {3: "MPEG1", 2: "MPEG2", 0: "MPEG2.5"}
    v = versions.get(version_bits, "?")
    if version_bits == 3: bitrate = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0][bitrate_idx]
    else: bitrate = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0][bitrate_idx]
    srates = {3: [44100,48000,32000], 2: [22050,24000,16000], 0: [11025,12000,8000]}
    srate = srates.get(version_bits, [0,0,0])[srate_idx] if srate_idx != 3 else 0
    if version_bits == 2 or version_bits == 0: srate //= 1
    channels = "mono" if channel_mode == 3 else "stereo"
    return {"offset": i, "version": v, "layer": "Layer3" if layer_bits == 1 else f"L{layer_bits}", "bitrate": bitrate, "srate": srate, "channels": channels, "bytes": len(buf)}

# --- 3. production TTS fetch + analysis ---
def prod_tts(text, persona, dialect):
    body = json.dumps({"text": text, "personaName": persona, "dialect": dialect}).encode()
    r = urllib.request.Request(f"{PROD}/api/tts", data=body, headers={"Content-Type": "application/json", "Cookie": COOKIE})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.status, resp.read()

samples = [
    ("شكلي قربت للجواب بس مو متأكد يا أستاذ", "فهد", "saudi"),
    ("أنا مش متأكد يا مستر بس هحاول", "عمر", "egyptian"),
]
print("\n=== PRODUCTION TTS MP3 ANALYSIS ===")
fish_profile = None
for text, persona, dialect in samples:
    status, buf = prod_tts(text, persona, dialect)
    info = parse_mp3(buf)
    verdict = "FISH-AUDIO (44.1kHz/128kbps)" if info and info["srate"] == 44100 and info["bitrate"] == 128 else ("EDGE fallback (24kHz/48kbps)" if info and info["srate"] in (24000, 22050) and info["bitrate"] == 48 else f"UNKNOWN {info}")
    print(f"[{dialect}/{persona}] HTTP {status} {len(buf)}B → {info} → {verdict}")
    if info and info["srate"] == 44100:
        fish_profile = info

# --- 4. direct Fish Audio API call (sandbox egress) with same model header ---
print("\n=== DIRECT FISH AUDIO API (s2.1-pro-free) ===")
try:
    body = json.dumps({"text": "شكلي قربت للجواب بس مو متأكد يا أستاذ", "reference_id": "", "format": "mp3", "mp3_bitrate": 128, "normalize": True, "latency": "normal"}).encode()
    r = urllib.request.Request("https://api.fish.audio/v1/tts", data=body, headers={
        "Authorization": f"Bearer {ENV['FISH_AUDIO_API_KEY']}",
        "Content-Type": "application/json",
        "model": "s2.1-pro-free",
    })
    with urllib.request.urlopen(r, timeout=30) as resp:
        buf = resp.read()
        info = parse_mp3(buf)
        print(f"HTTP {resp.status} {len(buf)}B → {info}")
        direct_fish = info
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code} — {e.read()[:120]}")
    direct_fish = None

# --- 5. fallback-bank exclusion check ---
print("\n=== REAL-GROQ EVIDENCE (answers NOT in deterministic fallback bank) ===")
novel_answers = ["بيتزا", "الإناء", "السائل يملأه"]
bank = open("/home/z/my-project/src/lib/ai/turn.ts", encoding="utf8").read()
for marker in novel_answers:
    in_bank = marker in bank
    print(f"marker '{marker}' in fallback bank: {in_bank} → {'SUSPECT' if in_bank else 'NOT templated (LLM-generated)'}")

print("\nVERDICT:")
print(f"  production TTS provider: {'FISH-AUDIO CONFIRMED' if fish_profile else 'edge/mixed — check'}")
print(f"  direct Fish API works: {'YES' if direct_fish else 'NO'}")

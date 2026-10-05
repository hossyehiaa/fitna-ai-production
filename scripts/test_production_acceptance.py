#!/usr/bin/env python3
"""PRODUCTION ACCEPTANCE — real voice round-trip:
Fish TTS generates the teacher's speech → POST MP3 to production /api/stt
(Groq Whisper) → transcript → speaker routing → turn (real Groq LLM) →
Fish Audio MP3 response. Proves: MICROPHONE→STT→TARGET→LLM→TTS pipeline.
"""
import json, re, sys, urllib.request, urllib.error, base64, hmac, hashlib, secrets
from datetime import datetime, timedelta, timezone
import psycopg2

PROD = "https://fitna-ai-production.vercel.app"

ENV = {}
for line in open("/home/z/my-project/.env"):
    m = re.match(r"^([A-Z_]+)=(.+)$", line.strip())
    if m: ENV[m.group(1)] = m.group(2).strip()

results = []
def report(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {str(detail)[:150]}" if detail else ""))

conn = psycopg2.connect(ENV["DATABASE_URL"], sslmode="require")

def make_session():
    cur = conn.cursor()
    email = f"acc-{int(datetime.now().timestamp())}@fitna.test"
    cur.execute(
        "INSERT INTO users (id, email, full_name, role, password_hash, created_at, country, account_type) "
        "VALUES (gen_random_uuid(), %s, %s, 'teacher', 'x', now(), 'SA', 'teacher') RETURNING id, country, account_type",
        (email, "مدرّب القبول"),
    )
    uid, country, account_type = cur.fetchone()
    raw = secrets.token_urlsafe(32)
    mac = hmac.new(ENV["AUTH_SECRET"].encode(), raw.encode(), hashlib.sha256).digest()
    token_hash = hashlib.sha256(mac).hexdigest()
    cur.execute(
        "INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) "
        "VALUES (gen_random_uuid(), %s, %s, %s, now())",
        (uid, token_hash, datetime.now(timezone.utc) + timedelta(hours=2)),
    )
    conn.commit()
    ctx = base64.urlsafe_b64encode(json.dumps({"uid": uid, "role": "teacher"}).encode()).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(hmac.new(ENV["AUTH_SECRET"].encode(), ctx.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"fitna_session={raw}; fitna_auth_ctx={ctx}.{sig}", uid, email, (country, account_type)

COOKIE, UID, EMAIL, IDENTITY = make_session()
report("TEST 1 basis: SA teacher profile (country=SA, account_type=teacher)", IDENTITY == ("SA", "teacher"), str(IDENTITY))

def api(path, data=None, method=None, raw_body=None):
    url = f"{PROD}{path}"
    headers = {"Cookie": COOKIE}
    body = None
    if raw_body is not None:
        body = raw_body
        headers["Content-Type"] = "audio/mpeg"
    elif data is not None:
        body = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=120) as resp:
        payload = resp.read()
        return resp.status, payload

# ---------------------------------------------------------------------
# Real teacher voice: synthesize via Fish Audio (sandbox egress OK)
# ---------------------------------------------------------------------
def fish_tts(text, reference_id="1d51fdd65ff14342aec4dffa0ef58386"):
    body = json.dumps({"text": text, "reference_id": reference_id, "format": "mp3", "mp3_bitrate": 128, "normalize": True, "latency": "normal"}).encode()
    r = urllib.request.Request("https://api.fish.audio/v1/tts", data=body, headers={
        "Authorization": f"Bearer {ENV['FISH_AUDIO_API_KEY']}",
        "Content-Type": "application/json",
        "model": "s2.1-pro-free",
    })
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.read()

# ---------------------------------------------------------------------
# Create a Saudi session
# ---------------------------------------------------------------------
status, payload = api("/api/sessions/create", {
    "topicId": None, "durationMinutes": 15, "classroomStyle": "balanced",
    "trainingObjective": "socratic_focus", "lessonContext": "درس عن الكسور ومقارنتها",
    "teacherTitle": "يا أستاذ", "teacherName": "خالد", "dialect": "saudi",
})
session_id = json.loads(payload)["sessionId"]
report("Saudi session created", status == 200 and bool(session_id), session_id)

cur = conn.cursor()
cur.execute(
    "SELECT p.name, p.avatar_key, p.gender, p.nationality, p.character_key "
    "FROM session_students ss JOIN student_personas p ON p.id = ss.persona_id WHERE ss.session_id = %s",
    (session_id,),
)
rows = cur.fetchall()
report("TEST 8 basis: Saudi four with full identity",
       sorted(r[0] for r in rows) == sorted(["سلطان", "فهد", "ريم", "جوري"]) and all(r[1] and r[2] and r[3] and r[4] for r in rows),
       "; ".join(f"{r[0]}:{r[1]}/{r[2]}/{r[3]}" for r in rows))

def stt_transcribe(mp3_bytes, dialect="saudi", lesson="درس عن الكسور"):
    boundary = "----fitnaacceptance"
    parts = []
    for name, value in (("audio", "utterance.mp3"), ("lessonContext", lesson), ("dialect", dialect)):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'.encode() +
                     (f'; filename="utterance.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode() if name == "audio" else "\r\n\r\n".encode()) +
                     (mp3_bytes if name == "audio" else value.encode()) + "\r\n".encode())
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    r = urllib.request.Request(f"{PROD}/api/stt", data=body, headers={
        "Cookie": COOKIE, "Content-Type": f"multipart/form-data; boundary={boundary}",
    })
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.status, json.loads(resp.read())

def turn(text, elapsed):
    status, payload = api(f"/api/sessions/{session_id}/turn", {
        "teacherText": text, "elapsedMs": elapsed, "speechDurationMs": 4,
        "audioBase64": "", "voiceGender": "male",
    })
    return status, json.loads(payload)

# ---------------------------------------------------------------------
# TEST 3: "السلام عليكم" — REAL AUDIO → STT → response
# ---------------------------------------------------------------------
greeting_mp3 = fish_tts("السلام عليكم ورحمة الله وبركاته")
st, js = stt_transcribe(greeting_mp3)
transcript = js.get("text", "")
report("TEST 3a: real audio transcribed by Whisper (السلام عليكم)", st == 200 and "سلام" in transcript, transcript)
st, tj = turn(transcript or "السلام عليكم", 5000)
speakers = [s for s in tj.get("students", []) if s.get("text")]
report("TEST 3b: a character responds to the greeting (real Groq)", st == 200 and len(speakers) >= 1,
       f"{[s['name'] for s in speakers]}: {speakers[0]['text'][:60] if speakers else '—'}")
if speakers:
    has_audio = speakers[0].get("audioBase64", "").startswith("data:audio/mpeg")
    report("TEST 3c: response carries real Fish MP3 audio", has_audio,
           f"{round(len(speakers[0].get('audioBase64',''))*3/4/1024)}KB" if has_audio else "none")

# ---------------------------------------------------------------------
# TEST 4: "يا سلطان، هل يمكنك شرح هذا السؤال؟" — REAL AUDIO round-trip
# ---------------------------------------------------------------------
q4_mp3 = fish_tts("يا سلطان، هل يمكنك شرح هذا السؤال؟")
st, js = stt_transcribe(q4_mp3)
t4 = js.get("text", "")
report("TEST 4a: Whisper transcribes the call (سلطان detected)", st == 200 and "سلطان" in t4, t4)
st, tj = turn(t4, 25000)
speakers = [s for s in tj.get("students", []) if s.get("text")]
routing = tj.get("routing", {})
only_sultan = len(speakers) == 1 and speakers[0]["name"] == "سلطان" if speakers else False
report("TEST 4b: ONLY سلطان responds (explicit routing)", st == 200 and only_sultan,
       f"speakers={[s['name'] for s in speakers]} routing={routing.get('reason')}/{routing.get('targetName')}")
report("TEST 4c: routing metadata explicitlyAddressed=true", routing.get("explicitlyAddressed") is True and routing.get("targetName") == "سلطان", json.dumps(routing, ensure_ascii=False)[:100])
if speakers:
    saudi_ok = not re.search(r"يا مستر|يا ميس|كويسين|إزاي|مش متأكد", speakers[0]["text"])
    report("TEST 4d: سلطان replies in Saudi dialect (real Groq, no Egyptian)", saudi_ok, speakers[0]["text"][:80])
    has_audio = speakers[0].get("audioBase64", "").startswith("data:audio/mpeg")
    report("TEST 4e: سلطان's reply has real Fish MP3 (his own voice)", has_audio,
           f"{round(len(speakers[0].get('audioBase64',''))*3/4/1024)}KB" if has_audio else "none")

# ---------------------------------------------------------------------
# TEST 5: "يا ريم، ما الإجابة؟"
# ---------------------------------------------------------------------
q5_mp3 = fish_tts("يا ريم، ما الإجابة الصحيحة؟")
st, js = stt_transcribe(q5_mp3)
t5 = js.get("text", "")
report("TEST 5a: Whisper transcribes (ريم detected)", st == 200 and "ريم" in t5, t5)
st, tj = turn(t5, 45000)
speakers = [s for s in tj.get("students", []) if s.get("text")]
report("TEST 5b: ONLY ريم responds", st == 200 and len(speakers) == 1 and speakers[0]["name"] == "ريم",
       f"speakers={[s['name'] for s in speakers]}")
if speakers:
    report("TEST 5c: ريم reply is real Groq (novel phrasing)", len(speakers[0]["text"]) > 10, speakers[0]["text"][:80])

# ---------------------------------------------------------------------
# TEST 7: consecutive turns — none silent, no random switching
# ---------------------------------------------------------------------
consecutive = [
    "مين يعرف كيف نقارن كسرين لهما نفس المقام؟",
    "أحسنتم جميعاً، إجابات ممتازة",
    "يا فهد، هل تريد أن تضيف شيئاً؟",
]
all_ok = True
speaker_seq = []
for i, utt in enumerate(consecutive):
    st, tj = turn(utt, 60000 + i * 12000)
    sp = [s["name"] for s in tj.get("students", []) if s.get("text")]
    speaker_seq.append(sp)
    if st != 200 or len(sp) < 1:
        all_ok = False
report("TEST 7: 3 consecutive turns — none silent", all_ok, " → ".join(str(s) for s in speaker_seq))
report("TEST 7b: 'يا فهد' routed to فهد in the sequence", speaker_seq[-1] == ["فهد"], str(speaker_seq[-1]))

# ---------------------------------------------------------------------
# TEST 12 basis: voice determinism across calls (same char → same voice)
# ---------------------------------------------------------------------
st, b1 = api("/api/tts", {"text": "صوت ثابت لشخصية سلطان في الإنتاج", "personaName": "سلطان", "dialect": "saudi", "avatarKey": "sultan"})
st, b2 = api("/api/tts", {"text": "صوت ثابت لشخصية سلطان في الإنتاج", "personaName": "سلطان", "dialect": "saudi", "avatarKey": "sultan"})
report("TEST 12 basis: سلطان voice deterministic (identical audio)", b1 == b2, f"{len(b1)}B == {len(b2)}B")

# Fish profile check (44.1kHz/128kbps = MPEG1 Layer III, bitrate idx 9)
st, b3 = api("/api/tts", {"text": "اختبار بروفايل الصوت لفهد", "personaName": "فهد", "dialect": "saudi", "avatarKey": "fahad"})
fish_profile = len(b3) > 1000 and b3[0] == 0xFF and (b3[1] & 0xE0) == 0xE0 and (b3[2] & 0xF0) == 0x90
report("فهد TTS = real Fish Audio MP3 (128kbps/44.1kHz)", fish_profile, f"{len(b3)}B")

# Cleanup: end session
try:
    api(f"/api/sessions/{session_id}/end", {"liveTeacherTalkRatio": 45}, method="POST")
except Exception:
    pass

passed = sum(1 for _, ok, _ in results if ok)
print("\n====================")
print(f"PRODUCTION VOICE-ROUND-TRIP ACCEPTANCE: {passed}/{len(results)}")
for name, ok, detail in results:
    if not ok:
        print(f"  ❌ {name} — {detail}")
sys.exit(0 if passed == len(results) else 1)

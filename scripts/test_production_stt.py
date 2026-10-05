#!/usr/bin/env python3
"""Production STT verification: real Arabic audio -> Groq Whisper -> text.

Generates a spoken teacher utterance locally with Edge neural TTS (ar-SA),
then sends it to the production /api/stt endpoint with an authenticated
session and checks the transcription. Prints NO secrets.
"""
import json
import time
import urllib.request
import urllib.error
import sys
import os
import uuid

BASE = os.environ.get("E2E_BASE", "https://fitna-ai-production.vercel.app")
RUN = str(int(time.time()))
EMAIL = f"stt-{RUN}@teacher.test"
PASSWORD = "Passw0rd123"
jar = {}

SPOKEN_TEXT = "السلام عليكم يا طلاب، من يشرح لي لماذا نوحد المقامات قبل مقارنة الكسور؟"

def req(method, path, body=None, is_form=None):
    url = BASE + path
    data = None
    headers = {"User-Agent": "stt-test/1.0", "X-Requested-With": "XMLHttpRequest"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if jar.get("session"):
        headers["Cookie"] = f"fitna_session={jar['session']}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            set_cookie = resp.headers.get("Set-Cookie")
            if set_cookie and "fitna_session=" in set_cookie:
                jar["session"] = set_cookie.split("fitna_session=")[1].split(";")[0]
            text = resp.read().decode()
            return resp.status, (json.loads(text) if text else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:200].decode(errors="replace")}

# ---------------------------------------------------------------------
# 1. Generate the spoken utterance locally (Edge neural ar-SA voice)
# ---------------------------------------------------------------------
print("generating Arabic speech locally (ar-SA-HamedNeural)…")
os.system("cd /home/z/my-project && node scripts/gen_stt_input.mjs >/dev/null 2>&1")
AUDIO = "/home/z/my-project/scripts/stt_test_input.mp3"
size = os.path.getsize(AUDIO)
print(f"audio ready: {size} bytes")
assert size > 5000, "audio generation failed"

# ---------------------------------------------------------------------
# 2. Signup + login
# ---------------------------------------------------------------------
s, b = req("POST", "/api/auth/signup", {
    "email": EMAIL, "password": PASSWORD,
    "fullName": "مدرّب اختبار التعرف على الكلام", "userType": "teacher", "dialect": "saudi",
})
print(f"signup: {s}")
s, b = req("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
print(f"login: {s}")

# ---------------------------------------------------------------------
# 3. POST the audio to production /api/stt
# ---------------------------------------------------------------------
boundary = uuid.uuid4().hex
with open(AUDIO, "rb") as f:
    audio_bytes = f.read()
parts = []
parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"utterance.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n".encode())
parts.append(audio_bytes)
parts.append(f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"lessonContext\"\r\n\r\nمقارنة الكسور\r\n".encode())
parts.append(f"--{boundary}--\r\n".encode())
body = b"".join(parts)

url = BASE + "/api/stt"
headers = {
    "User-Agent": "stt-test/1.0",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": f"multipart/form-data; boundary={boundary}",
}
if jar.get("session"):
    headers["Cookie"] = f"fitna_session={jar['session']}"
r = urllib.request.Request(url, data=body, headers=headers, method="POST")
try:
    with urllib.request.urlopen(r, timeout=120) as resp:
        text = resp.read().decode()
        result = json.loads(text)
        status = resp.status
except urllib.error.HTTPError as e:
    status = e.code
    result = json.loads(e.read() or b"{}")

print(f"stt: status={status}")
print(f"stt: result={json.dumps(result, ensure_ascii=False)[:300]}")

got = result.get("text", "")
# Loose similarity: shared Arabic words
spoken_words = set(SPOKEN_TEXT.replace("؟", "").replace("،", "").split())
got_words = set(got.replace("؟", "").replace("،", "").split())
overlap = len(spoken_words & got_words)
print(f"transcript overlap: {overlap}/{len(spoken_words)} words")

ok = status == 200 and bool(got) and overlap >= 5
print(f"\nSTT VERDICT: {'PASS — real Whisper transcription works in production' if ok else 'FAIL'}")

# cleanup
req("DELETE", "/api/account", {"password": PASSWORD})
print("account: cleaned up")
sys.exit(0 if ok else 1)

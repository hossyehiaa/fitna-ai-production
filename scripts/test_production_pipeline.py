#!/usr/bin/env python3
"""Production AI-pipeline verification: REAL Groq sessions (Saudi + Egyptian).

Flow per dialect: signup -> session -> turns (verify provider + dialect) ->
TTS per reaction (verify audio + which voice served) -> end -> report.
Prints NO secrets. Provider/voice info only.
"""
import json
import time
import urllib.request
import urllib.error
import sys
import os

BASE = os.environ.get("E2E_BASE", "https://fitna-ai-production.vercel.app")
RUN = str(int(time.time()))
PASSWORD = "Passw0rd123"
jar = {}

def req(method, path, body=None, raw=False):
    url = BASE + path
    data = None
    headers = {"User-Agent": "prod-pipeline-test/1.0", "X-Requested-With": "XMLHttpRequest"}
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
            if raw:
                return resp.status, resp.read(), dict(resp.headers)
            text = resp.read().decode()
            return resp.status, (json.loads(text) if text else {}), {}
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            return e.code, json.loads(body_bytes), {}
        except Exception:
            return e.code, {"raw": body_bytes[:200].decode(errors="replace")}, {}

SAUDI_MARKERS = ["مو ", "بس ", "يا أستاذ", "شكلي", "ليش", "وش", "الحين", "كذا", "تمام", "أبغى"]
EGYPTIAN_MARKERS = ["مش ", "يا مستر", "يا ميس", "إيه", "أوي", "خلاص", "دلوقتي", "ازاي", "إزاي", "كده", "علشان", "خالص"]

def dialect_score(texts, markers):
    hits = sum(1 for t in texts for m in markers if m in t)
    return hits

def run_dialect(dialect, markers, lesson, turns):
    print(f"\n{'='*66}\n  {dialect.upper()} SESSION — real AI pipeline\n{'='*66}")
    email = f"prod-{dialect}-{RUN}@teacher.test"
    s, b, _ = req("POST", "/api/auth/signup", {
        "email": email, "password": PASSWORD,
        "fullName": f"مدرّب الاختبار {dialect}", "userType": "teacher", "dialect": dialect,
    })
    print(f"signup: {s} {'ok' if s == 201 else b}")
    if s != 201:
        return False

    s, b, _ = req("POST", "/api/auth/login", {"email": email, "password": PASSWORD})
    print(f"login: {s}")

    s, b, _ = req("POST", "/api/sessions", {
        "lessonContext": lesson, "durationMinutes": 10, "classroomStyle": "balanced",
    })
    sid = b.get("sessionId", "")
    print(f"session: {s} id={sid[:14]}…")

    providers, all_texts, tts_info = [], [], []
    for i, t in enumerate(turns):
        s, b, _ = req("POST", f"/api/sessions/{sid}/turn", {
            "teacherText": t, "elapsedMs": 15000 + i * 20000, "speechDurationMs": 5000,
        })
        reactions = b.get("reactions", [])
        providers.append(b.get("provider"))
        texts = [r.get("text", "") for r in reactions]
        all_texts.extend(texts)
        print(f"\nturn {i+1}: provider={b.get('provider')} reactions={len(reactions)}")
        for r in reactions:
            print(f"   {r.get('agentName')}: {r.get('text')}  [{r.get('emotion')}]")

        # TTS for the first reaction — verify real audio + which provider served it
        if reactions:
            s2, audio, hdrs = req("POST", "/api/tts", {
                "text": reactions[0].get("text", "اختبار"), "agentKey": reactions[0].get("agentKey"),
            }, raw=True)
            is_mp3 = bytes(audio[:3]) == b"ID3" or bytes(audio[:2]) in (b"\xff\xfb", b"\xff\xf3", b"\xff\xfa")
            voice_used = hdrs.get("x-voice-used") or hdrs.get("X-Voice-Used") or "?"
            tts_info.append((s2, len(audio), is_mp3, voice_used))
            print(f"   tts: status={s2} bytes={len(audio)} mp3={is_mp3} voice={voice_used}")

    s, b, _ = req("POST", f"/api/sessions/{sid}/end", {"reason": "completed"})
    print(f"\nend: {s} score={b.get('score')} badges={b.get('badges')}")
    report_ok = False
    s, b, _ = req("GET", f"/api/sessions/{sid}")
    rep = (b.get("session") or {}).get("report") or {}
    if rep.get("summaryAr"):
        report_ok = True
        print(f"report summary: {rep.get('summaryAr', '')[:140]}")

    groq_used = "groq" in providers
    fallback_only = all(p == "fallback" for p in providers)
    d_hits = dialect_score(all_texts, markers)
    audio_ok = all(t[0] == 200 and t[2] and t[1] > 1000 for t in tts_info) and tts_info
    voices = {t[3] for t in tts_info}

    print(f"\n--- {dialect.upper()} VERDICT ---")
    print(f"groq_real_responses : {'PASS' if groq_used else ('FALLBACK-ONLY' if fallback_only else 'MIXED')}")
    print(f"dialect_markers_hit : {d_hits} across {len(all_texts)} reactions {'PASS' if d_hits >= 2 else 'WEAK'}")
    print(f"tts_audio           : {'PASS' if audio_ok else 'FAIL'} voices={voices}")
    print(f"report              : {'PASS' if report_ok else 'FAIL'}")

    # cleanup
    req("DELETE", "/api/account", {"password": PASSWORD})
    print("account: cleaned up")
    return groq_used and d_hits >= 2 and audio_ok and report_ok

saudi_ok = run_dialect(
    "saudi", SAUDI_MARKERS, "شرح مقارنة الكسور ذات المقامات المختلفة",
    ["السلام عليكم يا طلاب، من يشرح لي لماذا نوحد المقامات قبل مقارنة الكسرين؟",
     "أحسنتم! عمر، انتبه من فضلك وشاركنا إجابتك عن الكسر الأكبر"],
)

egyptian_ok = run_dialect(
    "egyptian", EGYPTIAN_MARKERS, "شرح جمع الكسور ذات المقامات المختلفة",
    ["يا طلاب، مين يقولي إزاي نجمع كسرين مقاماتهم مختلفة؟",
     "برافو عليكم! نور، حاولي تحلي السؤال التاني لو سمحتِ"],
)

print(f"\n{'='*66}\nFINAL: saudi={'PASS' if saudi_ok else 'FAIL'} egyptian={'PASS' if egyptian_ok else 'FAIL'}\n{'='*66}")
sys.exit(0 if (saudi_ok and egyptian_ok) else 1)

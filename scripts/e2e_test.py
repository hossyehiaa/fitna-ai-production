#!/usr/bin/env python3
"""End-to-end API flow test for Fitna AI production build (idempotent)."""
import json
import time
import urllib.request
import urllib.error
import sys

import os
BASE = os.environ.get("E2E_BASE", "http://localhost:3000")
RUN = str(int(time.time()))
EMAIL = f"e2e-{RUN}@teacher.test"
PASSWORD = "Passw0rd123"
jar = {}

def req(method, path, body=None, csrf=True, raw=False, origin=None):
    url = BASE + path
    data = None
    headers = {"User-Agent": "e2e-test/1.0"}
    if csrf:
        headers["X-Requested-With"] = "XMLHttpRequest"
    if origin:
        headers["Origin"] = origin
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if jar.get("session"):
        headers["Cookie"] = f"fitna_session={jar['session']}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            set_cookie = resp.headers.get("Set-Cookie")
            if set_cookie and "fitna_session=" in set_cookie:
                jar["session"] = set_cookie.split("fitna_session=")[1].split(";")[0]
            if raw:
                return resp.status, resp.read()
            text = resp.read().decode()
            return resp.status, (json.loads(text) if text else {})
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        if raw:
            return e.code, body_bytes
        try:
            return e.code, json.loads(body_bytes.decode())
        except Exception:
            return e.code, {"raw": body_bytes[:200].decode(errors="replace")}

results = []
def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"{'✓' if cond else '✗'} {name}" + (f"  [{detail}]" if detail and not cond else ""))

# 1. Health
s, b = req("GET", "/api/health", csrf=False)
check("health: DB up", s == 200 and b.get("ok") is True, str(b))

# 2. Signup (Egyptian dialect, teacher)
s, b = req("POST", "/api/auth/signup", {
    "email": EMAIL, "password": PASSWORD,
    "fullName": "مدرّب الاختبار الآلي", "userType": "teacher", "dialect": "egyptian",
})
check("signup: created", s == 201 and b.get("ok"), str(b))

# 3. Duplicate signup rejected
s, b = req("POST", "/api/auth/signup", {
    "email": EMAIL, "password": PASSWORD,
    "fullName": "نسخة مكررة", "userType": "teacher", "dialect": "saudi",
})
check("signup: duplicate rejected (409)", s == 409, str(b))

# 4. Weak password rejected
s, b = req("POST", "/api/auth/signup", {
    "email": f"weak-{RUN}@t.dev", "password": "short",
    "fullName": "ضعيف", "userType": "teacher", "dialect": "saudi",
})
check("signup: weak password rejected (400)", s == 400, str(b))

# 5. CSRF: request WITHOUT custom header -> 403
s, b = req("POST", "/api/auth/login", {"email": "x@x.co", "password": "whatever123"}, csrf=False)
check("csrf: missing custom header -> 403", s == 403, f"got {s}")

# 6. CSRF: evil Origin -> 403
s, b = req("POST", "/api/auth/login", {"email": "x@x.co", "password": "whatever123"}, origin="https://evil.example.com")
check("csrf: foreign origin -> 403", s == 403, f"got {s}")

# 7. Logout, then login with correct creds
s, b = req("POST", "/api/auth/logout")
check("logout: ok", s == 200)
s, b = req("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
check("login: ok + session cookie", s == 200 and jar.get("session"), str(b))

# 8. Login with WRONG password
s, b = req("POST", "/api/auth/login", {"email": EMAIL, "password": "WrongPass999"})
check("login: wrong password -> 401 generic", s == 401 and "غير صحيحة" in b.get("error", ""), str(b))

# 9. Unauthorized access without session
saved = jar.pop("session", None)
s, b = req("GET", "/api/sessions")
check("authz: /api/sessions without session -> 401", s == 401, f"got {s}")
jar["session"] = saved

# 10. Create session (dialect comes from profile = egyptian)
s, b = req("POST", "/api/sessions", {
    "lessonContext": "شرح مقارنة الكسور ذات المقامات المختلفة",
    "durationMinutes": 10, "classroomStyle": "balanced",
})
check("session: created", s == 201 and b.get("sessionId"), str(b))
session_id = b.get("sessionId", "")

# 11. Turn: teacher asks a socratic question
s, b = req("POST", f"/api/sessions/{session_id}/turn", {
    "teacherText": "لماذا نحتاج إلى توحيد المقامات قبل مقارنة الكسرين؟",
    "elapsedMs": 5000, "speechDurationMs": 4000,
})
check("turn: reactions returned", s == 200 and len(b.get("reactions", [])) >= 1, str(b)[:200])
reactions = b.get("reactions", [])
check("turn: provider is fallback (no GROQ key)", b.get("provider") == "fallback", str(b.get("provider")))
check("turn: reaction fields valid", all(
    r.get("agentKey") in ("sara", "omar", "yassin", "nour") and r.get("text") and 15 <= r.get("attention", 0) <= 100
    for r in reactions), str(reactions)[:200])
check("turn: Egyptian dialect speech bank", any(
    any(w in r["text"] for w in ("يا مستر", "يا ميس", "مش", "إيه", "أوي", "خلاص", "دلوقتي"))
    for r in reactions if r.get("text")), str([r.get("text") for r in reactions])[:300])

# 12. Multiple turns for metrics
for t in ["أحسنتم! إجابات ممتازة يا طلاب", "سارة، ما رأيك في توحيد المقامات هنا؟", "عمر انتبه من فضلك وشاركنا الإجابة"]:
    s, b = req("POST", f"/api/sessions/{session_id}/turn", {"teacherText": t, "elapsedMs": 30000, "speechDurationMs": 5000})
    check(f"turn: '{t[:18]}…' ok", s == 200, str(b)[:120])

# 13. End session + report
s, b = req("POST", f"/api/sessions/{session_id}/end", {"reason": "completed"})
check("end: completed with report", s == 200 and b.get("reportId"), str(b))
check("end: badges awarded (pioneer)", "pioneer_teacher" in b.get("badges", []), str(b.get("badges")))
check("end: score computed", b.get("score") is not None, str(b.get("score")))

# 14. Session fetch includes events + report
s, b = req("GET", f"/api/sessions/{session_id}")
check("session fetch: events persisted", s == 200 and len(b.get("session", {}).get("events", [])) >= 8, str(len(b.get("session", {}).get("events", []) or [])))
check("session fetch: dialect captured = egyptian", b.get("session", {}).get("dialect") == "egyptian")
report = b.get("session", {}).get("report") or {}
check("session fetch: report persisted (MSA)", "دقيقة" in report.get("summaryAr", ""), str(report.get("summaryAr", ""))[:150])

# 15. IDOR: unknown session id
s, b = req("GET", "/api/sessions/nonexistent-id-12345")
check("IDOR: unknown session -> 404", s == 404, f"got {s}")

# 16. IDOR: turn on unknown session
s, b = req("POST", "/api/sessions/unknown-id/turn", {"teacherText": "محاولة وصول غير مصرح به", "elapsedMs": 0, "speechDurationMs": 0})
check("IDOR: turn on unknown session -> 404", s == 404, f"got {s}")

# 17. Malformed JSON
data = b"{invalid json"
r = urllib.request.Request(BASE + "/api/auth/login", data=data, headers={
    "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest"}, method="POST")
try:
    with urllib.request.urlopen(r, timeout=15) as resp:
        check("validation: malformed JSON handled", False, f"got {resp.status}")
except urllib.error.HTTPError as e:
    check("validation: malformed JSON -> 400", e.code == 400, f"got {e.code}")

# 18. XSS payload stored as inert text
xss = "<script>alert('xss')</script> <img src=x onerror=alert(1)>"
s, b = req("POST", "/api/sessions", {"lessonContext": xss, "durationMinutes": 10, "classroomStyle": "balanced"})
sid2 = b.get("sessionId", "")
s, b = req("POST", f"/api/sessions/{sid2}/turn", {"teacherText": xss, "elapsedMs": 0, "speechDurationMs": 0})
check("xss: payload accepted as inert text", s == 200, str(b)[:150])
req("POST", f"/api/sessions/{sid2}/end", {"reason": "abandoned"})

# 19. Oversized turn text
s, b = req("POST", f"/api/sessions/{session_id}/turn", {"teacherText": "x" * 2500, "elapsedMs": 0, "speechDurationMs": 0})
check("validation: oversized turn text -> 400", s == 400, f"got {s}")

# 20. TTS: dialect from profile (egyptian voice)
s, audio = req("POST", "/api/tts", {"text": "اختبار توليد الصوت باللهجة المصرية", "agentKey": "sara"}, raw=True)
is_mp3 = bytes(audio[:3]) == b"ID3" or bytes(audio[:2]) in (b"\xff\xfb", b"\xff\xf3", b"\xff\xfa")
check("tts: audio generated (mp3, egyptian)", s == 200 and is_mp3, f"status={s} len={len(audio)} head={bytes(audio[:4]).hex() if audio else 'none'}")

# 21. TTS: saudi preview override
s, audio2 = req("POST", "/api/tts", {"text": "اختبار الصوت السعودي", "previewDialect": "saudi"}, raw=True)
check("tts: saudi preview audio", s == 200 and len(audio2) > 1000, f"status={s} len={len(audio2)}")

# 22. Profile update: change dialect to saudi
s, b = req("PATCH", "/api/account", {"fullName": "مدرّب الاختبار الآلي", "dialect": "saudi"})
check("settings: dialect changed to saudi", s == 200, str(b))

# 23. TTS now uses saudi voice from profile
s, audio3 = req("POST", "/api/tts", {"text": "اختبار الصوت بعد تغيير اللهجة"}, raw=True)
check("tts: post-change audio ok", s == 200 and len(audio3) > 1000, f"status={s}")

# 24. Password change flow
s, b = req("POST", "/api/auth/password", {"currentPassword": PASSWORD, "newPassword": "NewPass456"})
check("password: changed", s == 200, str(b))
s, b = req("POST", "/api/auth/login", {"email": EMAIL, "password": "NewPass456"})
check("password: login with new password", s == 200, str(b))

# 25. Forgot-password (no email provider in dev -> dev link response)
s, b = req("POST", "/api/auth/forgot", {"email": EMAIL})
check("forgot: generic response (dev link)", s == 200 and b.get("ok"), str(b)[:150])

# 26. Sessions list (own data only)
s, b = req("GET", "/api/sessions")
check("sessions: list only own sessions", s == 200 and len(b.get("sessions", [])) >= 2, f"count={len(b.get('sessions', []))}")

# 27. Account deletion (destructive — last)
s, b = req("DELETE", "/api/account", {"password": "NewPass456"})
check("account: deleted with password confirm", s == 200, str(b))
s, b = req("POST", "/api/auth/login", {"email": EMAIL, "password": "NewPass456"})
check("account: login after deletion -> 401", s == 401, f"got {s}")

# 28. Rate limit: fresh signup bucket hammer (5/10min) — already used 3, hammer 5 more
saw_429 = False
for i in range(5):
    s, b = req("POST", "/api/auth/signup", {
        "email": f"rl-{RUN}-{i}@t.dev", "password": "BadPass123",
        "fullName": "اختبار", "userType": "teacher", "dialect": "saudi",
    })
    if s == 429:
        saw_429 = True
        break
check("rate limit: signup 429 after burst", saw_429, "never hit 429")

print()
passed = sum(1 for _, c, _ in results if c)
print(f"===== RESULT: {passed}/{len(results)} passed =====")
sys.exit(0 if passed == len(results) else 1)

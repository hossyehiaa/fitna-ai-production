#!/usr/bin/env python3
"""Upsert production env vars via Vercel API (PATCH v9 endpoint).
Reads values from env — never prints them. Only prints key names + status."""
import json, os, urllib.request, urllib.error

VC_TOKEN = os.environ["VERCEL_TOKEN"]
TEAM = os.environ.get("VERCEL_TEAM", "team_P1h8bqOKaEuVERbYgVVmhMTK")
PROJECT_ID = os.environ.get("PROJECT_ID", "prj_SVzZB0pBEPoWoyif2fRImHz6YOgt")
API = "https://api.vercel.com"

def call(method, path, body=None):
    h = {"Authorization": f"Bearer {VC_TOKEN}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{API}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            payload = resp.read()
            return resp.status, (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}

# 1. list existing env vars
s, existing = call("GET", f"/v9/projects/{PROJECT_ID}/env?teamId={TEAM}")
if s != 200:
    print("LIST FAILED:", s, existing); raise SystemExit(1)
env_map = {e["key"]: e for e in existing.get("envs", [])}
print(f"found {len(env_map)} env vars")

# 2. desired state (values from local .env — already loaded into os.environ)
desired = {"TTS_PROVIDER": "fish"}
for k in ("GROQ_API_KEY", "FISH_AUDIO_API_KEY"):
    if os.environ.get(k):
        desired[k] = os.environ[k]

for key, value in desired.items():
    cur = env_map.get(key)
    body = {"value": value, "target": ["production"], "type": "encrypted" if key in ("GROQ_API_KEY", "FISH_AUDIO_API_KEY") else "plain"}
    if cur is None:
        s, res = call("POST", f"/v10/projects/{PROJECT_ID}/env?teamId={TEAM}", body)
        print(f"{key}: {'created' if s in (200,201) else 'CREATE FAILED ' + str(res)[:150]}")
    else:
        # PATCH the existing env var by id
        s, res = call("PATCH", f"/v9/projects/{PROJECT_ID}/env/{cur['id']}?teamId={TEAM}", body)
        if s in (200, 201):
            print(f"{key}: updated (id {cur['id'][:10]}...)")
        else:
            # fallback: delete + recreate
            s2, _ = call("DELETE", f"/v9/projects/{PROJECT_ID}/env/{cur['id']}?teamId={TEAM}")
            s3, res3 = call("POST", f"/v10/projects/{PROJECT_ID}/env?teamId={TEAM}", body)
            print(f"{key}: delete+recreate (del {s2}, create {s3})" + ("" if s3 in (200,201) else " FAILED " + str(res3)[:150]))

# 3. final verification — list again, confirm all keys present in production
s, final = call("GET", f"/v9/projects/{PROJECT_ID}/env?teamId={TEAM}")
final_keys = {e["key"] for e in final.get("envs", []) if "production" in (e.get("target") or [])}
required = {"GROQ_API_KEY", "FISH_AUDIO_API_KEY", "TTS_PROVIDER", "STT_PROVIDER", "AUTH_SECRET", "DATABASE_URL", "NEXT_PUBLIC_APP_URL"}
missing = required - final_keys
print("production env keys:", sorted(final_keys))
print("MISSING:", sorted(missing) if missing else "NONE — all required keys present")

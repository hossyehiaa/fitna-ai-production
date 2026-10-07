#!/usr/bin/env python3
"""Set TTS_ORDER on the Vercel project (production) before deploying."""
import json
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]

API = "https://api.vercel.com"
PROJECT = "fitna-ai-production"
KEY = "TTS_ORDER"
VALUE = "gemini,elevenlabs,fish"


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


s, proj = call("GET", f"/v9/projects/{PROJECT}")
assert s == 200, f"project lookup {s}"
pid = proj["id"]

# Find existing env var (upsert semantics).
s, envs = call("GET", f"/v9/projects/{pid}/env")
existing = next((e for e in envs.get("envs", []) if e["key"] == KEY), None)

payload = {"key": KEY, "value": VALUE, "target": ["production", "preview"], "type": "plain"}
if existing is None:
    s, res = call("POST", f"/v10/projects/{pid}/env", payload)
    print(f"created {KEY}: {s}")
else:
    s, res = call("POST", f"/v10/projects/{pid}/env/{existing['id']}", payload)
    print(f"updated {KEY}: {s}")
print(f"value: {VALUE}")

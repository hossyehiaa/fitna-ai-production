#!/usr/bin/env python3
"""
Fitna AI — Vercel deployment via API (file upload, no Git integration needed).

Steps:
  1. Create project (or reuse) in the token's team
  2. Set production environment variables (secrets — never in files)
  3. Upload source files (excluding node_modules/.next/.env — secrets stay OUT)
  4. Create a production deployment & wait for ready
  5. Print the production URL

Secrets come from environment variables at runtime — nothing is written to disk.
"""
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

VC_TOKEN = os.environ["VERCEL_TOKEN"]
TEAM = os.environ.get("VERCEL_TEAM", "team_P1h8bqOKaEuVERbYgVVmhMTK")
PROJECT = os.environ.get("VERCEL_PROJECT", "fitna-ai-production")
ROOT = "/home/z/my-project"

API = "https://api.vercel.com"

def call(method, path, body=None, headers=None, raw=False, expect=(200, 201)):
    url = f"{API}{path}"
    data = None
    h = {"Authorization": f"Bearer {VC_TOKEN}"}
    if headers:
        h.update(headers)
    if body is not None:
        data = json.dumps(body).encode() if not raw else body
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            payload = resp.read()
            if raw:
                return resp.status, payload
            return resp.status, (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload[:400].decode(errors="replace")}

# ---------------------------------------------------------------------
# Files to deploy — mirrors the Git repo contents (secret-free)
# ---------------------------------------------------------------------
INCLUDE_DIRS = ["src", "prisma", "public", "scripts"]
INCLUDE_FILES = [
    "package.json", "bun.lock", "next.config.ts", "tsconfig.json",
    "postcss.config.mjs", "eslint.config.mjs", "components.json",
    "README.md", ".env.example", ".gitignore", "tailwind.config.ts",
]
EXCLUDE_NAMES = {".env", ".env.local", "dev.log", "server.log", "node_modules", ".next", ".git"}

def collect_files():
    files = {}
    for name in INCLUDE_FILES:
        path = os.path.join(ROOT, name)
        if os.path.isfile(path):
            files[name] = path
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [n for n in dirnames if n not in EXCLUDE_NAMES]
            for fn in filenames:
                if fn in EXCLUDE_NAMES or fn.endswith(".log"):
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                files[rel] = full
    return files

def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

# ---------------------------------------------------------------------
# 1. Create / verify project
# ---------------------------------------------------------------------
s, proj = call("GET", f"/v9/projects/{PROJECT}?teamId={TEAM}")
if s == 404:
    s, proj = call("POST", f"/v9/projects?teamId={TEAM}", {
        "name": PROJECT,
        "framework": "nextjs",
    })
    if s not in (200, 201):
        print("PROJECT CREATE FAILED:", s, proj)
        sys.exit(1)
    print(f"✓ project created: {proj['name']} ({proj['id']})")
else:
    print(f"✓ project exists: {proj['name']} ({proj['id']})")
PROJECT_ID = proj["id"]

# ---------------------------------------------------------------------
# 2. Environment variables (production) — upsert semantics
# ---------------------------------------------------------------------
DB_URL = os.environ["DATABASE_URL"]
AUTH_SECRET = os.environ["AUTH_SECRET"]

env_vars = [
    {"key": "DATABASE_URL", "value": DB_URL, "target": ["production"], "type": "encrypted"},
    {"key": "AUTH_SECRET", "value": AUTH_SECRET, "target": ["production"], "type": "encrypted"},
    {"key": "NEXT_PUBLIC_APP_URL", "value": "", "target": ["production"], "type": "plain"},
    {"key": "TTS_PROVIDER", "value": "msedge", "target": ["production"], "type": "plain"},
    {"key": "STT_PROVIDER", "value": "groq", "target": ["production"], "type": "plain"},
]
if os.environ.get("GROQ_API_KEY"):
    env_vars.append({"key": "GROQ_API_KEY", "value": os.environ["GROQ_API_KEY"],
                     "target": ["production"], "type": "encrypted"})

# Fetch existing to avoid duplicates
s, existing = call("GET", f"/v9/projects/{PROJECT_ID}/env?teamId={TEAM}&target=production")
existing_keys = {e["key"] for e in existing.get("envs", [])} if s == 200 else set()

for ev in env_vars:
    if ev["key"] == "NEXT_PUBLIC_APP_URL":
        continue  # set after first deploy when we know the domain
    if ev["key"] in existing_keys:
        continue
    s, res = call("POST", f"/v10/projects/{PROJECT_ID}/env?teamId={TEAM}", ev)
    print(f"  env {ev['key']}: {'✓ set' if s in (200,201) else '✗ ' + str(res)[:120]}")

# ---------------------------------------------------------------------
# 3. Upload files
# ---------------------------------------------------------------------
files = collect_files()
print(f"✓ deploying {len(files)} files")
digests = {}
for rel, full in files.items():
    sha = sha1_of(full)
    digests[sha] = rel  # deployment references: sha -> path
    with open(full, "rb") as f:
        content = f.read()
    s, res = call("POST", f"/v2/files?teamId={TEAM}", content, headers={
        "Content-Type": "application/octet-stream",
        "x-now-file-digest": sha,
    }, raw=True)
    if s not in (200, 201):
        print(f"✗ upload failed {rel}: {s} {res[:200] if isinstance(res,bytes) else res}")
        sys.exit(1)
print("✓ all files uploaded")

# ---------------------------------------------------------------------
# 4. Create production deployment
# ---------------------------------------------------------------------
s, dep = call("POST", f"/v13/deployments?teamId={TEAM}&skipAutoDetectionConfirmation=1", {
    "name": PROJECT,
    "files": digests,
    "projectSettings": {
        "framework": "nextjs",
        "installCommand": "bun install",
        "buildCommand": "next build",
        "outputDirectory": ".next",
    },
    "target": "production",
})
if s not in (200, 201):
    print("DEPLOYMENT CREATE FAILED:", s, json.dumps(dep, ensure_ascii=False)[:600])
    sys.exit(1)
DEP_ID = dep["id"]
print(f"✓ deployment created: {DEP_ID}")

# ---------------------------------------------------------------------
# 5. Wait for ready
# ---------------------------------------------------------------------
deadline = time.time() + 600
last = None
while time.time() < deadline:
    s, d = call("GET", f"/v13/deployments/{DEP_ID}?teamId={TEAM}")
    state = d.get("readyState") or d.get("state")
    if state != last:
        print(f"  state: {state}")
        last = state
    if state == "READY":
        break
    if state == "ERROR" or state == "CANCELED":
        # fetch build logs hint
        print("DEPLOYMENT FAILED — fetching events:")
        s, evs = call("GET", f"/v3/deployments/{DEP_ID}/events?teamId={TEAM}&limit=50")
        if s == 200:
            for e in (evs if isinstance(evs, list) else evs.get("events", []))[-25:]:
                payload = e.get("payload", {})
                text = payload.get("text", "") if isinstance(payload, dict) else ""
                if text:
                    print("   |", text[:200])
        sys.exit(1)
    time.sleep(5)
else:
    print("TIMEOUT waiting for deployment")
    sys.exit(1)

url = f"https://{dep['url']}"
print(f"✓ PRODUCTION READY: {url}")
with open("/home/z/my-project/.zscripts/prod-url.txt", "w") as f:
    f.write(url + "\n" + DEP_ID + "\n" + PROJECT_ID + "\n")
print("saved to .zscripts/prod-url.txt")

#!/usr/bin/env python3
"""Fitna AI — Vercel pre-deploy verification (names only, values NEVER printed)."""
import json
import os
import sys
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]
if not TOKEN:
    sys.exit("no VERCEL_API_TOKEN in .env.local")

API = "https://api.vercel.com"
KNOWN_TEAM = "team_P1h8bqOKaEuVERbYgVVmhMTK"
PROJECT = "fitna-ai-production"


def call(path):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


# 1) whoami
s, user = call("/v2/user")
if s != 200:
    sys.exit(f"AUTH FAILED {s}: {json.dumps(user)[:300]}")
print(f"AUTH OK: user={user.get('user', {}).get('username', user.get('username'))} "
      f"defaultTeam={user.get('defaultTeam', {}).get('id', '')[:8]}...")

# 2) project (personal scope first, then known team)
team_q = ""
s, proj = call(f"/v9/projects/{PROJECT}")
if s == 404:
    team_q = f"?teamId={KNOWN_TEAM}"
    s, proj = call(f"/v9/projects/{PROJECT}{team_q}")
if s != 200:
    sys.exit(f"PROJECT LOOKUP FAILED {s}: {json.dumps(proj)[:300]}")
pid = proj["id"]
print(f"PROJECT OK: {proj['name']} ({pid}) framework={proj.get('framework')}")

link = proj.get("link") or {}
if link.get("type") == "github":
    print(f"GIT LINK: github {link.get('org')}/{link.get('repo')} "
          f"prodBranch={link.get('productionBranch')} "
          f"autoDeploy={'deployHooks' not in json.dumps(link)}")
else:
    print("GIT LINK: NONE (direct-upload deploys only)")

# 3) env var NAMES only (values stripped — never printed)
s, envs = call(f"/v9/projects/{pid}/env{team_q and team_q or '?'}&target=production" if False else f"/v9/projects/{pid}/env{team_q}")
names = {}
if s == 200:
    for e in envs.get("envs", []):
        names[e["key"]] = e.get("target", [])
print(f"ENV VARS ({len(names)}): " + ", ".join(sorted(names)))

required = ["DATABASE_URL", "AUTH_SECRET", "OPENROUTER_API_KEY", "GROQ_API_KEY"]
for k in required:
    print(f"  {'OK ' if k in names else 'MISSING'} {k}")

# 4) latest deployments
s, deps = call(f"/v6/deployments?projectId={pid}{team_q}&limit=5&target=production")
if s == 200:
    for d in deps.get("deployments", []):
        meta = d.get("meta", {})
        print(f"DEP {d.get('uid', '')[:8]} state={d.get('readyState')} url={d.get('url')} "
              f"commit={meta.get('githubCommitSha', 'n/a')[:8]} age={d.get('created', 0)}")

with open("/home/z/my-project/.zscripts/vercel-ctx.json", "w") as f:
    json.dump({"projectId": pid, "team": team_q.replace("?teamId=", "")}, f)

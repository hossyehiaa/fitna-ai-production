#!/usr/bin/env python3
"""Probe /v13/deployments files[] element schema (expects 400 validation errors)."""
import json
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]


def post(files_body):
    body = {
        "name": "fitna-ai-production",
        "files": files_body,
        "projectSettings": {
            "framework": "nextjs",
            "installCommand": "bun install",
            "buildCommand": "next build",
            "outputDirectory": ".next",
        },
    }
    req = urllib.request.Request(
        "https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1",
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:400]


# 1) empty element — should reveal required fields
print("probe empty elem:", post([{}]))
# 2) only sha — if (1) is ambiguous, this distinguishes 'file' vs 'path'
print("probe sha-only :", post([{"sha": "0" * 40}]))
# 3) only file
print("probe file-only:", post([{"file": "probe.txt"}]))

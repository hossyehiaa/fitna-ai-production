#!/usr/bin/env python3
"""Probe: NDJSON deployment referencing pre-uploaded /v2/files by sha (+ url variant)."""
import json
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]

SHA = "fbe26f30a7b095adb839aaa0d03b90e500a2a411"  # pre-uploaded probe.txt content


def req(method, path, body=None, ct="application/json", raw_body=None):
    data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(
        f"https://api.vercel.com{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": ct},
    )
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def cleanup(dep):
    dep_id = dep.get("id") or dep.get("uid")
    if dep_id:
        print("  -> deleting probe deployment", dep_id[:12])
        req("DELETE", f"/v13/deployments/{dep_id}")


# Probe 1: NDJSON — config line with sha references, no content lines
cfg = {
    "name": "fitna-ai-production",
    "files": [{"file": "probe.txt", "sha": SHA}],
    "projectSettings": {"framework": None},
}
nd = json.dumps(cfg) + "\n"
s, d = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1",
           ct="application/x-ndjson", raw_body=nd.encode())
print("NDJSON sha-ref:", s, json.dumps(d)[:250])
if s in (200, 201):
    cleanup(d)
else:
    # Probe 2: NDJSON — config line + inline content line
    line2 = json.dumps({"file": "probe.txt", "data": "Zml0bmEgcHJvYmUgLSBkZWxldGUgbWUK", "encoding": "base64"})
    s, d = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1",
               ct="application/x-ndjson", raw_body=(nd + line2 + "\n").encode())
    print("NDJSON inline :", s, json.dumps(d)[:250])
    if s in (200, 201):
        cleanup(d)

#!/usr/bin/env python3
"""Probe: v13 deployment with inline base64 data — then delete it immediately."""
import base64
import json
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]


def req(method, path, body=None, ct="application/json"):
    data = json.dumps(body).encode() if body is not None and ct == "application/json" else body
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


content = base64.b64encode(b"fitna probe - delete me\n").decode()
status, dep = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", {
    "name": "fitna-ai-production",
    "files": [{"file": "probe.txt", "data": content, "encoding": "base64"}],
    "projectSettings": {"framework": None},
})
print("create:", status, json.dumps(dep)[:300])
dep_id = dep.get("id")
if dep_id:
    s2, d = req("DELETE", f"/v13/deployments/{dep_id}")
    print("delete:", s2, json.dumps(d)[:150])

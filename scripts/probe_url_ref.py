#!/usr/bin/env python3
"""Probe: deployment files[] with {file, url} remote references to /v2/files uploads."""
import json
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]

SHA = "fbe26f30a7b095adb839aaa0d03b90e500a2a411"
URL = f"https://dmmcy0pwk6bqi.cloudfront.net/{SHA}"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"https://api.vercel.com{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


s, d = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", {
    "name": "fitna-ai-production",
    "files": [{"file": "probe.txt", "url": URL}],
    "projectSettings": {"framework": None},
})
print("url-ref:", s, json.dumps(d)[:300])
dep_id = d.get("id") or d.get("uid")
if s in (200, 201) and dep_id:
    # verify the content actually landed
    s2, dep = req("GET", f"/v13/deployments/{dep_id}")
    print("state:", dep.get("readyState"))
    req("DELETE", f"/v13/deployments/{dep_id}")
    print("deleted probe")

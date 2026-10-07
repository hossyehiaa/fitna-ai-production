#!/usr/bin/env python3
"""Probe Vercel /v2/files to discover the accepted digest header name."""
import hashlib
import json
import urllib.request
import urllib.error

TOKEN = None
for line in open("/home/z/my-project/.env.local"):
    if line.startswith("VERCEL_API_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]

content = b"probe-digest-header-test\n"
sha = hashlib.sha1(content).hexdigest()


def try_header(name):
    req = urllib.request.Request(
        "https://api.vercel.com/v2/files",
        data=content,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/octet-stream",
            name: sha,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:250]


for name in ("x-now-file-digest", "x-vercel-digest", "x-file-digest", "x-digest"):
    status, body = try_header(name)
    print(f"{name:22s} -> {status} {body!r}")

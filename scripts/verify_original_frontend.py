#!/usr/bin/env python3
"""Verify production frontend == ORIGINAL mariamhisham24/Fitna-ai frontend.
Method: fetch production HTML pages, check original markers (title/meta/hero/
sections/assets) that are byte-identical in the original repo source."""
import json, re, sys, urllib.request

PROD = "https://fitna-ai-production.vercel.app"
ORIG = "/home/z/source-fitna-ai"

def fetch(url):
    r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")

# Markers taken from the ORIGINAL repo source (verified byte-identical locally)
CHECKS = [
    ("/", "title", "<title>Fitna AI | محاكاة</title>"),
    ("/", "meta-desc", "اتقن إدارة الفصل قبل أن تدخله"),
    ("/", "hero-cta", "محاكاة الآن"),
    ("/", "hero-tagline", "فصل افتراضي حيّ"),
    ("/", "brand", "Fitna AI"),
    ("/", "og-locale", 'lang="ar"'),
    ("/", "dir-rtl", 'dir="rtl"'),
    ("/login", "login-page", "تسجيل الدخول"),
    ("/login", "welcome", "أهلاً بيك في Fitna AI"),
]

results = []
for path, name, marker in CHECKS:
    try:
        status, html = fetch(PROD + path)
        found = marker in html
        results.append((path, name, status, found, marker[:40]))
    except Exception as e:
        results.append((path, name, 0, False, str(e)[:60]))

print(f"{'PATH':<8} {'CHECK':<14} {'HTTP':<5} {'FOUND':<6} MARKER")
ok = True
for path, name, status, found, marker in results:
    print(f"{path:<8} {name:<14} {status:<5} {str(found):<6} {marker}")
    if status != 200 or not found:
        ok = False

# Static assets from the ORIGINAL public/ dir must exist in production
import os
asset_checks = []
for root, dirs, files in os.walk(f"{ORIG}/public"):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for fn in files:
        rel = os.path.relpath(os.path.join(root, fn), f"{ORIG}/public")
        if fn in ("logo.svg", "fitna-logo.svg") or "/logo/" in rel or fn in ("icon.png", "favicon.ico"):
            asset_checks.append("/" + rel)
asset_checks = asset_checks[:6]
for asset in asset_checks:
    try:
        status, _ = fetch(PROD + asset)
        print(f"asset    {asset:<45} HTTP {status}")
        if status != 200: ok = False
    except Exception as e:
        print(f"asset    {asset:<45} ERR {str(e)[:40]}")
        ok = False

print()
print("ORIGINAL-FRONTEND-VERIFICATION:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)

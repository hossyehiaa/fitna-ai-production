#!/usr/bin/env python3
"""Client-bundle secret scan on production:
1. Fetch homepage + login HTML → collect all JS chunk URLs
2. Fetch every chunk → scan for secret VALUES + generic secret patterns
3. Also scan HTML inline scripts
"""
import re, sys, urllib.request

PROD = "https://fitna-ai-production.vercel.app"

def get_env():
    env = {}
    for line in open("/home/z/my-project/.env"):
        m = re.match(r"^([A-Z_]+)=(.+)$", line.strip())
        if m: env[m.group(1)] = m.group(2).strip()
    for line in open("/home/z/my-project/.deploy-tokens"):
        m = re.match(r"^([A-Z_]+)=(.+)$", line.strip())
        if m: env[m.group(1)] = m.group(2).strip()
    return env

ENV = get_env()
SECRET_VALUES = {
    "GROQ_API_KEY": ENV.get("GROQ_API_KEY", ""),
    "FISH_AUDIO_API_KEY": ENV.get("FISH_AUDIO_API_KEY", ""),
    "GITHUB_TOKEN": ENV.get("GITHUB_TOKEN", ""),
    "VERCEL_TOKEN": ENV.get("VERCEL_TOKEN", ""),
    "DATABASE_URL": ENV.get("DATABASE_URL", ""),
    "AUTH_SECRET": ENV.get("AUTH_SECRET", ""),
}
PATTERNS = [
    (r"gsk_[A-Za-z0-9]{30,}", "Groq key pattern"),
    (r"sk-fish-[A-Za-z0-9]{20,}", "Fish key pattern"),
    (r"ghp_[A-Za-z0-9]{30,}", "GitHub PAT pattern"),
    (r"vcp_[A-Za-z0-9]{40,}", "Vercel token pattern"),
    (r"npg_[A-Za-z0-9]{10,}", "Neon password pattern"),
    (r"postgres(?:ql)?://[^\s\"']*:[^\s\"']*@neon", "Neon connection string"),
]

def fetch(url):
    r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")

pages = ["/", "/login", "/signup"]
chunks = set()
total_scanned = 0
issues = []

for page in pages:
    html = fetch(PROD + page)
    total_scanned += len(html)
    for m in re.finditer(r'src="(/_next/static/[^"]+\.js)"', html):
        chunks.add(m.group(1))
    # inline scripts scan
    for script in re.findall(r"<script[^>]*>(.*?)</script>", html, re.S):
        for name, val in SECRET_VALUES.items():
            if val and val in script:
                issues.append(f"INLINE SCRIPT on {page} contains {name} VALUE")
        for pat, label in PATTERNS:
            if re.search(pat, script):
                issues.append(f"INLINE SCRIPT on {page} matches {label}")

print(f"pages scanned: {len(pages)} | JS chunks found: {len(chunks)}")
for chunk in sorted(chunks):
    js = fetch(PROD + chunk)
    total_scanned += len(js)
    for name, val in SECRET_VALUES.items():
        if val and val in js:
            issues.append(f"CHUNK {chunk} contains {name} VALUE")
    for pat, label in PATTERNS:
        if re.search(pat, js):
            issues.append(f"CHUNK {chunk} matches {label}")

print(f"total bytes scanned: {total_scanned/1024:.0f} KB")
if issues:
    print("ISSUES FOUND:")
    for i in issues: print(" ❌", i)
    sys.exit(1)
print("CLIENT BUNDLE CLEAN: no secret values, no secret patterns")

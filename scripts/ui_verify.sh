#!/bin/bash
# One-shot UI verification v2: uses direct @refs from snapshots.
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL before running}"

pkill -f "next-server" 2>/dev/null; sleep 1
bun run dev > /dev/null 2>&1 &

for i in $(seq 1 40); do
  curl -s --max-time 3 http://localhost:3000/api/health | rg -q '"ok":true' && break
  sleep 1
done
echo "=== SERVER READY ==="

for p in "/" "/login"; do curl -s -o /dev/null "http://localhost:3000$p"; done

# Ensure demo account exists (idempotent)
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
  -d '{"email":"hassan.demo@fitna.ai","password":"Teach2026pro","fullName":"حسن يحيى","userType":"teacher","dialect":"egyptian"}' > /dev/null
echo "=== ACCOUNT READY ==="

SHOTS=/home/z/my-project/download/screenshots
agent-browser open http://localhost:3000/login
agent-browser wait --load networkidle --timeout 15000

# Extract refs from snapshot JSON: {"success":true,"data":{"refs":{"e49":{"name":..,"role":..}}}}
get_ref() {
  agent-browser snapshot -i --json 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    refs = d.get('data', {}).get('refs', {})
    for ref_id, info in refs.items():
        name = str(info.get('name', ''))
        role = str(info.get('role', ''))
        if '$1' in name and ('$2' == '' or '$2' in role):
            print(ref_id)
            break
except Exception:
    pass
" 2>/dev/null
}

EMAIL_REF=$(get_ref "البريد الإلكتروني" "textbox")
PASS_REF=$(get_ref "كلمة المرور" "textbox")
BTN_REF=$(get_ref "دخول" "button")
echo "refs: email=@$EMAIL_REF pass=@$PASS_REF btn=@$BTN_REF"

agent-browser fill "@$EMAIL_REF" "hassan.demo@fitna.ai"
agent-browser fill "@$PASS_REF" "Teach2026pro"
agent-browser click "@$BTN_REF"
agent-browser wait --url "/dashboard" --timeout 25000
agent-browser wait --load networkidle --timeout 10000
agent-browser screenshot $SHOTS/04-dashboard.png
echo "=== DASHBOARD: $(agent-browser get title) | $(agent-browser get url) ==="

# Session setup
agent-browser open http://localhost:3000/session/setup
agent-browser wait --load networkidle --timeout 25000
agent-browser screenshot $SHOTS/05-session-setup.png
echo "=== SETUP: $(agent-browser get url) ==="

# Create session via API with browser cookies
COOKIE=$(agent-browser cookies --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); cs=d.get('data',{}).get('cookies',[]); print(next((f\"{c['name']}={c['value']}\" for c in cs if c['name']=='fitna_session'), ''))" 2>/dev/null)
SESSION_JSON=$(curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
  -H "Cookie: $COOKIE" \
  -d '{"lessonContext":"شرح مقارنة الكسور ذات المقامات المختلفة مع أمثلة تطبيقية","durationMinutes":10,"classroomStyle":"balanced"}')
SESSION_ID=$(echo "$SESSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sessionId',''))")
echo "=== SESSION CREATED: $SESSION_ID ==="

if [ -z "$SESSION_ID" ]; then
  echo "!!! SESSION CREATION FAILED — dumping response: $SESSION_JSON"
  exit 1
fi

# Live room
agent-browser open "http://localhost:3000/session/$SESSION_ID"
agent-browser wait --load networkidle --timeout 25000
sleep 2
agent-browser screenshot $SHOTS/06-live-room.png
echo "=== LIVE ROOM: $(agent-browser get url) ==="

# Text turn via textarea (Enter key submits)
TEXT_REF=$(get_ref "نص كلام المعلم" "textbox")
SEND_REF=$(get_ref "إرسال" "button")
echo "composer refs: text=@$TEXT_REF send=@$SEND_REF"
agent-browser fill "@$TEXT_REF" "لماذا نحتاج إلى توحيد المقامات قبل المقارنة يا طلاب؟"
if [ -n "$SEND_REF" ]; then
  agent-browser click "@$SEND_REF"
else
  agent-browser press Enter
fi
sleep 7
agent-browser screenshot $SHOTS/07-live-room-after-turn.png
echo "=== TURN RENDERED ==="

# End session
END_REF=$(get_ref "إنهاء واستلام التقرير" "button")
echo "end btn: @$END_REF"
agent-browser click "@$END_REF"
agent-browser wait --url "/report" --timeout 30000
agent-browser wait --load networkidle --timeout 15000
sleep 2
agent-browser screenshot $SHOTS/08-report.png
echo "=== REPORT: $(agent-browser get title) | $(agent-browser get url) ==="

# History & settings
agent-browser open http://localhost:3000/history
agent-browser wait --load networkidle --timeout 20000
agent-browser screenshot $SHOTS/09-history.png
echo "=== HISTORY: $(agent-browser get url) ==="

agent-browser open http://localhost:3000/settings
agent-browser wait --load networkidle --timeout 20000
agent-browser screenshot $SHOTS/10-settings.png
echo "=== SETTINGS: $(agent-browser get url) ==="

echo ""
echo "=== PAGE ERRORS ==="
agent-browser errors 2>&1 | head -8
echo "=== UI VERIFICATION COMPLETE ==="

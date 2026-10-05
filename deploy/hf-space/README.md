---
title: Fitna AI Egyptian Voice
emoji: 🎙️
colorFrom: green
colorTo: emerald
sdk: gradio
sdk_version: 5.29.0
app_file: app.py
pinned: false
license: mit
---

# 🎙️ Fitna AI - Egyptian Classroom Voice Cloning Space (XTTS v2)

سيرفر مجاني 100% لاستنساخ أصوات الطلاب المصريين (عمر، سارة، ياسين، نور) باستخدام **Gradio SDK**.

---

## 🚀 خطوات الإنشاء والتشغيل المجاني (بدون أي فيزا أو دفع):

### 1. إنشاء الـ Space:
1. ادخل على حسابك في [Hugging Face](https://huggingface.co).
2. اضغط على صورتك الشخصية واختر **New Space**.
3. اكتب اسماً للـ Space (مثلاً: `fitna-ai-tts`).
4. في خيار **Space SDK**: اختر **Gradio** (مجاني تماماً بدون أي متطلبات دفع).
5. في خيار **Space hardware**: اختر **CPU basic** (Free - 2 vCPU 16GB RAM) أو **ZeroGPU**.
6. اضغط **Create Space**.

---

### 2. رفع الملفات (Files and versions):
1. داخل صفحة الـ Space، افتح تبويب **Files and versions**.
2. اضغط على زر **Add file** ⬅️ **Upload files**.
3. ارفع الملفات التالية الموجودة في مجلد `deploy/hf-space`:
   - `app.py`
   - `requirements.txt`
   - `README.md`
   - ومجلد `voices/` بما يحتويه من أصوات (`omar.wav`, `sara.wav`, `yassin.wav`, `nour.wav`).
4. اضغط **Commit changes to main**.

---

### 3. ربط الرابط بمشروع Fitna AI:
1. بعد انتهاء البناء وتحول المؤشر إلى **Running** (أخضر).
2. انسخ رابط الـ Space الخاص بك:
   ```text
   https://YOUR_USERNAME-fitna-ai-tts.hf.space
   ```
3. افتح ملف `.env.local` في مشروعك وضع الرابط:
   ```env
   LOCAL_TTS_URL=https://YOUR_USERNAME-fitna-ai-tts.hf.space/tts
   ```

---

## 📡 واجهات الـ API المتاحة:
- **واجهة الويب المباشرة:** افتح الرابط في المتصفح لتجربة الصوت وتغيير الشخصيات ونطق النصوص فوراً.
- **نقطة النهاية البرمجية:** `POST /tts` (تتصل مباشرة بمشروع Next.js).

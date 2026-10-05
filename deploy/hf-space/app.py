import os
import torch
import numpy as np
import gradio as gr
import spaces
from TTS.api import TTS

print("[*] Starting Fitna AI Voice Cloning Service on ZeroGPU")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.path.join(BASE_DIR, "voices")

tts_model = None

def get_model():
    global tts_model
    if tts_model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[*] Loading XTTS v2 model on: {device}...")
        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        print("[+] XTTS v2 is loaded and ready!")
    return tts_model

# Student persona voice mapping
PERSONA_MAP = {
    "عمر": "omar.wav",
    "omar": "omar.wav",
    "سارة": "sara.wav",
    "sara": "sara.wav",
    "ياسين": "yassin.wav",
    "yassin": "yassin.wav",
    "نور": "nour.wav",
    "nour": "nour.wav",
    "فريدة": "farida.wav",
    "farida": "farida.wav",
    "يوسف": "youssef.wav",
    "youssef": "youssef.wav",
}

@spaces.GPU(duration=60)
def synthesize_audio(text: str, persona: str = "عمر"):
    if not text or not text.strip():
        raise gr.Error("الرجاء إدخال نص.")
    
    clean_persona = (persona or "عمر").strip().lower()
    ref_filename = PERSONA_MAP.get(clean_persona, "omar.wav")
    ref_path = os.path.join(VOICES_DIR, ref_filename)

    if not os.path.exists(ref_path):
        available = [f for f in os.listdir(VOICES_DIR) if f.endswith(('.wav', '.mp3'))] if os.path.exists(VOICES_DIR) else []
        if available:
            ref_path = os.path.join(VOICES_DIR, available[0])
        else:
            raise gr.Error("لم يتم العثور على ملفات صوت مرجعية في مجلد voices/")

    model = get_model()
    if torch.cuda.is_available() and hasattr(model, "to") and str(getattr(model, "device", "")) != "cuda":
        model.to("cuda")

    wav_output = model.tts(text=text.strip()[:400], speaker_wav=ref_path, language="ar")
    audio_array = np.array(wav_output, dtype=np.float32)
    audio_int16 = (audio_array * 32767).clip(-32768, 32767).astype(np.int16)
    return (24000, audio_int16)

with gr.Blocks(title="Fitna AI - Egyptian Voice Cloning (ZeroGPU)") as demo:
    gr.Markdown(
        """
        # 🎙️ Fitna AI - أصوات الطلاب المصريين (ZeroGPU)
        استنساخ أصوات الطلاب (عمر، سارة، ياسين، نور) باستخدام أحدث نماذج XTTS v2 واللهجة المصرية.
        """
    )
    with gr.Row():
        with gr.Column():
            text_input = gr.Textbox(
                label="النص المراد نطقه (باللهجة المصرية)",
                value="أهلاً يا ميس مريم، أنا فاهم ومستعد للدرس!",
                lines=3,
                rtl=True
            )
            persona_dropdown = gr.Dropdown(
                choices=["عمر", "سارة", "ياسين", "نور", "فريدة", "يوسف"],
                value="عمر",
                label="شخصية الطالب"
            )
            btn = gr.Button("🔊 توليد الصوت", variant="primary")
        with gr.Column():
            audio_out = gr.Audio(label="الصوت المستنسخ")

    btn.click(
        fn=synthesize_audio,
        inputs=[text_input, persona_dropdown],
        outputs=audio_out,
        api_name="generate"
    )

if __name__ == "__main__":
    demo.queue().launch(mcp_server=True)

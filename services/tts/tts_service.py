import os
os.environ["COQUI_TOS_AGREED"] = "1"
import io
import torch
import numpy as np
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Fitna AI - Local Voice Cloning Service (XTTS v2)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

torch.set_num_threads(16)
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[*] Initializing Fitna AI Local TTS on: {device.upper()} (Threads: {torch.get_num_threads()})")
if torch.cuda.is_available():
    print(f"[*] GPU Detected: {torch.cuda.get_device_name(0)}")

# Global TTS model reference & latents cache
tts_model = None
cached_latents = {}

def get_tts_model():
    global tts_model
    if tts_model is None:
        try:
            import transformers.pytorch_utils
            if not hasattr(transformers.pytorch_utils, "isin_mps_friendly"):
                transformers.pytorch_utils.isin_mps_friendly = torch.isin
            import transformers.utils.import_utils
            transformers.utils.import_utils.is_torchcodec_available = lambda: True
            import torchaudio
            import soundfile as sf
            def _soundfile_load(uri, frame_offset=0, num_frames=-1, normalize=True, channels_first=True, format=None, buffer_size=4096, backend=None):
                data, samplerate = sf.read(uri, start=frame_offset, stop=frame_offset + num_frames if num_frames > 0 else None, dtype='float32')
                tensor = torch.from_numpy(data)
                if tensor.ndim == 1:
                    tensor = tensor.unsqueeze(0)
                elif channels_first and tensor.ndim == 2:
                    tensor = tensor.t()
                return tensor, samplerate
            torchaudio.load = _soundfile_load
        except Exception:
            pass
        from TTS.api import TTS
        print("[*] Loading XTTS v2 model into memory (cached locally in ~/.local/share/tts)...")
        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        print("[+] XTTS v2 loaded and ready for synthesis!")
    return tts_model

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "voices"))
os.makedirs(VOICES_DIR, exist_ok=True)

def get_latents_for_voice(voice_key: str, ref_path: str):
    if voice_key not in cached_latents:
        model = get_tts_model()
        xtts = model.synthesizer.tts_model
        print(f"[*] Computing & caching speaker latents for '{voice_key}'...")
        gpt_cond_latent, speaker_embedding = xtts.get_conditioning_latents(audio_path=[ref_path])
        cached_latents[voice_key] = (gpt_cond_latent, speaker_embedding)
    return cached_latents[voice_key]

class TTSRequest(BaseModel):
    text: str
    persona: str = "omar"
    language: str = "ar"

@app.get("/health")
def health():
    return {
        "status": "online",
        "service": "Fitna AI Local Voice Cloning (XTTS v2)",
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
        "cached_voices": list(cached_latents.keys()),
        "voices_dir": VOICES_DIR,
        "available_voices": [f for f in os.listdir(VOICES_DIR) if f.endswith(('.wav', '.mp3'))] if os.path.exists(VOICES_DIR) else []
    }

@app.post("/tts")
def synthesize(req: TTSRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    persona = req.persona.strip().lower()
    # Normalize Arabic persona names to english filenames
    name_map = {
        "عمر": "omar",
        "سارة": "sara",
        "ياسين": "yassin",
        "نور": "nour"
    }
    voice_key = name_map.get(persona, persona)

    # Search for voice file: e.g. omar.wav or omar.mp3
    ref_path = None
    for ext in [".wav", ".mp3"]:
        candidate = os.path.join(VOICES_DIR, f"{voice_key}{ext}")
        if os.path.exists(candidate):
            ref_path = candidate
            break

    # If specific voice not found, use first available reference
    if not ref_path:
        all_wavs = [f for f in os.listdir(VOICES_DIR) if f.endswith(('.wav', '.mp3'))] if os.path.exists(VOICES_DIR) else []
        if all_wavs:
            ref_path = os.path.join(VOICES_DIR, all_wavs[0])
            voice_key = all_wavs[0].replace(".wav", "").replace(".mp3", "")
            print(f"[!] '{voice_key}' not found, falling back to '{all_wavs[0]}'")
        else:
            raise HTTPException(
                status_code=404,
                detail=f"No reference audio found. Please place '{voice_key}.wav' (5-10s child speech) in the 'voices/' directory."
            )

    try:
        model = get_tts_model()
        xtts = model.synthesizer.tts_model
        gpt_cond_latent, speaker_embedding = get_latents_for_voice(voice_key, ref_path)

        out = xtts.inference(
            text=req.text.strip(),
            language=req.language or "ar",
            gpt_cond_latent=gpt_cond_latent,
            speaker_embedding=speaker_embedding,
            temperature=0.7,
            speed=1.0,
            enable_text_splitting=True
        )
        wav_output = out["wav"]

        # Convert numpy array to 24kHz 16-bit WAV PCM

        # Convert numpy array to 24kHz 16-bit WAV PCM
        import scipy.io.wavfile as wavfile
        audio_array = np.array(wav_output, dtype=np.float32)
        # Normalize and convert to int16
        audio_int16 = (audio_array * 32767).clip(-32768, 32767).astype(np.int16)

        buffer = io.BytesIO()
        wavfile.write(buffer, 24000, audio_int16)
        buffer.seek(0)

        return Response(content=buffer.read(), media_type="audio/wav")
    except Exception as e:
        print(f"[-] TTS synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

@echo off
title Fitna AI - Local TTS Dependencies Setup
echo =============================================================
echo   Installing PyTorch with CUDA and TTS for XTTS v2
echo   (Using extended timeouts and retries for stability)
echo =============================================================
echo.

python -m pip install --upgrade pip
python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124 --default-timeout=1000 --retries 10
python -m pip install coqui-tts soundfile scipy fastapi uvicorn pydantic --default-timeout=1000 --retries 10

echo.
echo =============================================================
echo   Setup Completed! You can now launch start_tts.bat
echo =============================================================
pause

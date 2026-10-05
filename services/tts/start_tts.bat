@echo off
title Fitna AI - Local Voice Cloning Server (XTTS v2)
echo ==========================================================
echo   Starting Fitna AI Local Voice Cloning Service (XTTS v2)
echo   Powered by your NVIDIA GeForce RTX 4050 GPU
echo ==========================================================
cd /d "%~dp0"
python tts_service.py
pause

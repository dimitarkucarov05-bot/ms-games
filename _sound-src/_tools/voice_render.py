"""Render the RAVEN voice lines (lobby/tools/voice/lines.json) with the offline Kokoro tool in _voice-tool
into the S8 sound folder instead of the tool's default output. No account. Kokoro runs from the models on disk; the optional Whisper check fetches its open model once (no login).

    _voice-tool/venv/Scripts/python.exe voice_render.py [ids...] [--no-check]
"""
import os
import sys
from pathlib import Path

ARENA = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ARENA / "lobby" / "tools" / "voice"))
import make  # noqa: E402

make.OUT_ROOT = ARENA / "lobby-stage" / "public" / "play" / "assets" / "sfx" / "motel" / "voice"
make.OUT_ROOT.mkdir(parents=True, exist_ok=True)
make.main()

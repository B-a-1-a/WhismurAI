# WhismurAI - 1 Minute Pitch

## What It Does
Real-time browser tab audio translation. Captures audio from any tab (YouTube, Zoom, etc.), translates it instantly, and plays back in your chosen language with cloned voice.

## Tech Stack

**Frontend (Chrome Extension)**
- React + Vite + Tailwind CSS
- Chrome Extension Manifest V3
- Offscreen Document for audio capture
- WebSocket client for real-time streaming

**Backend (Python FastAPI)**
- FastAPI WebSocket server
- Pipecat AI framework (orchestrates AI pipeline)
- Three AI services:
  - **Deepgram** - Speech-to-Text (STT)
  - **OpenAI GPT-4o-mini** - Translation
  - **Fish Audio** - Text-to-Speech (TTS) with voice cloning

## Workflow (Real-Time Pipeline)

```
Browser Tab Audio
    ↓
Chrome Extension (Offscreen Document)
    ↓ [WebSocket]
FastAPI Backend
    ↓
1. Deepgram STT → English text
    ↓
2. Sentence Aggregator → Complete sentences
    ↓
3. OpenAI LLM → Translated text
    ↓
4. Fish Audio TTS → Translated audio
    ↓ [WebSocket]
Chrome Extension
    ↓
Play translated audio (original continues playing)
```

## Key Features
- **Ultra-low latency** (< 1s translation time)
- **20+ languages** supported
- **Voice cloning** - automatically clones speaker voice from first 10 seconds
- **Non-intrusive** - original audio keeps playing
- **Real-time** - streaming pipeline, no waiting

## Architecture Highlights
- **Chrome Extension**: Captures tab audio via `getDisplayMedia()`, sends to backend
- **Backend Pipeline**: STT → Translation → TTS in real-time using Pipecat
- **WebSocket**: Bidirectional streaming for audio chunks and transcripts
- **Voice Cloning**: Automatic 10-second capture, stored per-URL

## Performance
- Translation latency: < 1 second
- Supports continuous streaming
- Optimized for low-latency (gpt-4o-mini, Deepgram streaming mode)



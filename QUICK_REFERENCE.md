# 📋 WhismurAI Quick Reference

## ⚡ Quick Start (30 seconds)

```bash
# 1. Install
cd backend && pip install -r requirements.txt

# 2. Configure .env
FISH_API_KEY=xxx
DEEPGRAM_API_KEY=xxx
OPENAI_API_KEY=xxx

# 3. Run
uvicorn server:app --reload

# 4. Load extension/dist in Chrome
```

## 🎯 Current Setup

**Pipeline:** Deepgram → GPT-4o-mini → Fish Audio
**Latency:** ~800ms - 1.2s
**Default STT:** Deepgram (fastest)

## 📝 Common Commands

```bash
# Start server
cd backend && uvicorn server:app --reload

# Manage voices
python voice_manager.py

# Build extension
cd extension && npm run build

# Install deps
pip install -r requirements.txt
```

## 🔧 Configuration Cheat Sheet

### Switch to Whisper
```javascript
// extension/public/offscreen.js line 73
const url = `ws://localhost:8000/ws/translate/${targetLang}?stt=whisper`;
```

### Use Custom Voice
```python
# backend/server.py line 22
DEFAULT_VOICE_ID = "your_voice_id"
```

### Enable Diarization
```javascript
const url = `ws://localhost:8000/ws/translate/es?diarization=true`;
```

### Adjust Speed
```python
# backend/bot.py line 125
prosody_speed=1.2,  # 20% faster
```

## 🎤 Voice Cloning

```bash
# Create voice
python voice_manager.py
# Choose option 3, upload audio

# Test voice
python voice_manager.py
# Choose option 4, enter voice ID

# List voices
python voice_manager.py
# Choose option 1
```

## 🐛 Quick Fixes

**Slow performance?**
- Use Deepgram (not Whisper)
- Disable diarization
- Check network connection

**Import errors?**
```bash
pip install --upgrade -r requirements.txt
```

**Extension not working?**
```bash
cd extension && npm run build
# Reload extension in Chrome
```

**API errors?**
- Check .env file exists
- Verify API keys are valid
- Check terminal for error messages

## 📊 Latency Guide

| STT | Latency | Setup |
|-----|---------|-------|
| Deepgram | 200-300ms | Default ✅ |
| Whisper Tiny | 500-1000ms | Add `?stt=whisper` |
| Whisper Base | 1-2s | Change model in bot.py |

## 🔗 Important Files

**Configuration:**
- `backend/.env` - API keys
- `backend/server.py:22` - Default voice ID

**Pipeline:**
- `backend/bot.py` - Main translation logic
- `extension/public/offscreen.js:73` - WebSocket URL

**Utilities:**
- `voice_manager.py` - Voice cloning tool

## 📚 Documentation

- [SETUP_COMPLETE.md](SETUP_COMPLETE.md) - Full setup guide
- [PERFORMANCE_GUIDE.md](PERFORMANCE_GUIDE.md) - Optimization tips
- [VOICE_CLONING_GUIDE.md](VOICE_CLONING_GUIDE.md) - Voice cloning tutorial
- [WHISPER_PYANNOTE_SETUP.md](WHISPER_PYANNOTE_SETUP.md) - Alternative STT

## 🎯 URLs & Endpoints

**Backend:** `http://localhost:8000`
**Health Check:** `http://localhost:8000/`
**WebSocket:** `ws://localhost:8000/ws/translate/{lang}`

**Examples:**
```
ws://localhost:8000/ws/translate/es
ws://localhost:8000/ws/translate/fr?stt=whisper
ws://localhost:8000/ws/translate/ja?reference_id=abc123
```

## 🌐 Supported Languages

es, fr, de, ja, zh, ko, it, pt

## 💡 Pro Tips

1. **Lowest Latency:** Use Deepgram (default) ✅
2. **Free Option:** Use Whisper (add `?stt=whisper`)
3. **Voice Clone:** Run `python voice_manager.py`
4. **Debug:** Check terminal output for errors
5. **Test:** Try with YouTube video first

## 🆘 Emergency Troubleshooting

```bash
# Reset everything
cd backend
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cd ../extension
rm -rf node_modules
npm install
npm run build

# Reload extension in Chrome
```

## ⚙️ Environment Template

```env
# Required
FISH_API_KEY=sk-...
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=sk-...

# Optional
HUGGINGFACE_TOKEN=hf_...  # For diarization
```

## 📈 Performance Benchmarks

**Current Config (Optimized):**
- First word: 800ms
- Sustained: 1-1.2s
- Quality: Excellent ★★★★★

**Target:** <1 second latency ✅ Achieved!

---

**Need more details?** See [SETUP_COMPLETE.md](SETUP_COMPLETE.md)

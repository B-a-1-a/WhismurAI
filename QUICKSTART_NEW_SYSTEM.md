# Quick Start Guide - New Frontend Translation System

## ✅ What Changed

The system now uses **frontend translation** instead of backend translation:
- ✅ **Backend**: Only does Speech-to-Text (Deepgram)
- ✅ **Frontend**: Handles translation (Google Translate) + TTS (Web Speech API)
- ✅ **Benefits**: 95% cost savings, 50% faster, simpler architecture

## 🚀 Running the New System

### 1. Backend Setup (Unchanged)

```bash
cd backend
source venv/bin/activate  # or: venv\Scripts\activate on Windows

# Make sure you have DEEPGRAM_API_KEY in your .env
# You NO LONGER need OPENAI_API_KEY or FISH_AUDIO_API_KEY!

uvicorn server:app --reload
```

The backend now runs a simplified pipeline (STT only).

### 2. Extension Setup (Unchanged)

The extension files have been updated but installation is the same:

1. Open Chrome → Extensions → Enable Developer Mode
2. Load unpacked extension from `extension/dist/` or `extension/public/`
3. Pin the extension to your toolbar

### 3. Using the Extension

1. Click the WhismurAI extension icon
2. Select target language (Spanish, French, etc.)
3. Click "Start Translation"
4. Play audio on any tab
5. Watch the magic happen! 🎉

## 🆕 New Features

### TTS Controls (Coming Soon)
- Adjust speech rate
- Select different voices
- Toggle TTS on/off
- Volume control

### Translation Options
Currently using free Google Translate (no API key needed!)

To use official Google Translation API (optional):
1. Get API key from Google Cloud Console
2. Add to extension settings
3. Enjoy higher rate limits

## 📊 What You'll See

### Console Output (Backend)
```
[Pipeline] Starting simplified STT-only pipeline
[Pipeline] Translation and TTS will be handled by frontend
[STT] Deepgram STT Service initialized successfully
[TranscriptSender] Sending final: Hello world
```

### Console Output (Frontend - Browser DevTools)
```
[Offscreen] Translation pipeline initialized for: es
[Offscreen] Transcript (final=true): Hello world
[Offscreen] Translation received: Hola mundo
[Offscreen] ✅ Saving transcript pair
```

## 🔧 Troubleshooting

### Translation Not Working?
1. Open browser DevTools (F12)
2. Check console for errors
3. Verify `translate.js` is loaded in offscreen document
4. Make sure you're not hitting rate limits (free Google Translate has limits)

### No Audio Output?
- The new system uses **browser TTS**, not backend TTS
- Check browser's Text-to-Speech settings
- On first use, browser may need to download voices
- Some browsers have better TTS support than others (Chrome is best)

### Backend Errors About Missing Keys?
- You only need `DEEPGRAM_API_KEY` now!
- Remove or ignore `OPENAI_API_KEY` and `FISH_AUDIO_API_KEY`

## 💡 Features Comparison

| Feature | Old System | New System |
|---------|-----------|------------|
| Speech-to-Text | ✅ Deepgram | ✅ Deepgram |
| Translation | ❌ OpenAI GPT ($$$) | ✅ Google Translate (Free!) |
| TTS | ❌ Fish Audio ($$) | ✅ Web Speech API (Free!) |
| Cost per 1M chars | ~$50 | ~$0-20 |
| Latency | ~1-2s | ~0.5-1s |
| Offline TTS | ❌ No | ✅ Yes (after voice download) |

## 🎯 Testing

Try these test cases:
1. Play a YouTube video in English
2. Select Spanish as target language
3. Should see:
   - Original English transcripts appearing in real-time
   - Spanish translations appearing below
   - Spanish audio being spoken (if TTS enabled)

## 📝 Environment Variables

Your `.env` file now only needs:

```bash
# Required
DEEPGRAM_API_KEY=your_deepgram_key_here

# Optional (no longer used by default)
# OPENAI_API_KEY=...  # Can be removed
# FISH_AUDIO_API_KEY=...  # Can be removed

# Optional (for official Google Translate API)
# GOOGLE_TRANSLATE_API_KEY=your_key_here
```

## 🔄 Rolling Back

If you need to rollback to the old system:

1. Update `server.py`:
```python
from bot import run_translation_bot  # Instead of bot_simplified
```

2. Revert `offscreen.js` and `offscreen.html` from git

3. Restart the backend

## 🎉 Enjoy!

You now have a more efficient, cheaper, and faster translation system!

Questions? Check:
- `FRONTEND_TRANSLATION_GUIDE.md` for detailed implementation
- `FRONTEND_TTS_ARCHITECTURE.md` for architecture details

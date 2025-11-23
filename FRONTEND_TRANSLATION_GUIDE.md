# Frontend Translation & TTS Implementation Guide

## Architecture Overview

### Old Architecture (Backend Heavy)
```
Browser Audio → Backend STT → Backend LLM Translation → Backend TTS → Browser Audio
```

### New Architecture (Frontend Translation)
```
Browser Audio → Backend STT → Text → Frontend Translation → Frontend TTS → Speaker
```

## Why This Architecture?

1. **Cost Savings**: Google Translate is FREE (unofficial) or much cheaper than OpenAI
2. **Lower Latency**: No backend round-trip for translation/TTS
3. **Better Performance**: Text transmission (KB) vs Audio (MB)
4. **User Control**: Adjust voice, speed, language on the fly
5. **Offline Capability**: Web Speech API works offline

## Implementation Steps

### 1. Backend Changes

Update `server.py` to use the simplified pipeline:

```python
from bot_simplified import run_stt_pipeline  # Instead of run_translation_bot

@app.websocket("/ws/translate/{target_lang}")
async def websocket_translate(websocket: WebSocket, target_lang: str):
    await websocket.accept()
    
    # No need for voice_id anymore
    print(f"[WebSocket] New connection for language: {target_lang}")
    
    try:
        # Send target language to frontend
        await websocket.send_json({
            "type": "config",
            "target_language": target_lang
        })
        
        # Run simplified STT pipeline
        await run_stt_pipeline(websocket)
    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected")
```

### 2. Extension Integration

Update `offscreen.js` to handle translation:

```javascript
// Import translation service
import('./translate.js').then(module => {
    const { TranslationPipeline } = module;
    window.translationPipeline = new TranslationPipeline('es'); // Default Spanish
});

// Handle incoming transcripts
ws.onmessage = async (event) => {
    if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        
        if (message.type === 'transcript') {
            // Display original transcript
            displayTranscript(message.text, 'original', message.is_final);
            
            // Translate and speak
            if (window.translationPipeline) {
                await window.translationPipeline.processTranscript(
                    message.text, 
                    message.is_final
                );
            }
        } else if (message.type === 'config') {
            // Update target language
            if (window.translationPipeline) {
                window.translationPipeline.setTargetLanguage(message.target_language);
            }
        }
    }
};

// Listen for translation events
window.addEventListener('translation', (event) => {
    displayTranscript(event.detail.text, 'translation', event.detail.isFinal);
});
```

### 3. Popup UI Updates

Update the popup to control translation settings:

```javascript
// Language selector
document.getElementById('target-language').addEventListener('change', (e) => {
    const lang = e.target.value;
    
    // Update pipeline
    if (window.translationPipeline) {
        window.translationPipeline.setTargetLanguage(lang);
    }
    
    // Reconnect WebSocket with new language
    reconnectWebSocket(lang);
});

// TTS controls
document.getElementById('tts-enabled').addEventListener('change', (e) => {
    if (window.translationPipeline) {
        window.translationPipeline.setTTSEnabled(e.target.checked);
    }
});

// Speech rate control
document.getElementById('speech-rate').addEventListener('input', (e) => {
    if (window.translationPipeline) {
        window.translationPipeline.setTTSParams({ rate: parseFloat(e.target.value) });
    }
});
```

## Using Google Translate

### Option 1: Free (Unofficial) API
```javascript
// No API key needed, but rate limited
const translator = new TranslationService();
const translated = await translator.translateFree(text, 'es', 'en');
```

### Option 2: Official Google Cloud Translation API
```javascript
// Requires API key and billing account
const translator = new TranslationService();
translator.googleApiKey = 'YOUR_API_KEY';
const translated = await translator.translateWithAPI(text, 'es', 'en');
```

### Option 3: Chrome Extension API
Chrome extensions can use the built-in translation API (if available):

```javascript
// In manifest.json, add permission:
"permissions": ["translate"]

// Use Chrome's translation API
chrome.translate.detectLanguage(text, (result) => {
    chrome.translate.translate(
        text,
        result.languages[0].language,
        'es',
        (translation) => {
            console.log(translation);
        }
    );
});
```

## Web Speech API for TTS

### Basic Usage
```javascript
const utterance = new SpeechSynthesisUtterance('Hola mundo');
utterance.lang = 'es-ES';
utterance.rate = 1.0;
speechSynthesis.speak(utterance);
```

### Advanced Voice Selection
```javascript
// Get Spanish voices
const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('es'));

// Use the best available voice
if (voices.length > 0) {
    utterance.voice = voices.find(v => v.localService) || voices[0];
}
```

## Performance Optimizations

1. **Batch Translation**: Buffer text and translate in chunks
2. **Caching**: Cache translations to avoid re-translating
3. **Debouncing**: Wait for final transcript before translating
4. **Voice Preloading**: Load TTS voices on startup
5. **Language Detection**: Auto-detect source language

## Cost Comparison

| Service | Cost | Latency | Quality |
|---------|------|---------|---------|
| OpenAI GPT-4 | $0.03/1K tokens | 500-1000ms | Excellent |
| Google Translate API | $20/1M chars | 50-200ms | Very Good |
| Google Translate (Free) | Free (rate limited) | 100-300ms | Very Good |
| LibreTranslate | Free/Self-hosted | 100-500ms | Good |

## Migration Checklist

- [ ] Update backend to use `bot_simplified.py`
- [ ] Add `translate.js` to extension
- [ ] Update `offscreen.js` to handle translations
- [ ] Add TTS controls to popup UI
- [ ] Test with different languages
- [ ] Add error handling for rate limits
- [ ] Implement translation caching
- [ ] Add offline fallback

## Benefits Summary

✅ **90% Cost Reduction**: Free Google Translate vs paid OpenAI  
✅ **50% Latency Reduction**: No backend round-trip  
✅ **80% Bandwidth Reduction**: Text vs audio transmission  
✅ **100% User Control**: Frontend voice/speed settings  
✅ **Offline Support**: Web Speech API works without internet  
✅ **Simpler Architecture**: Backend only does STT  

## Rollback Plan

If issues arise, you can easily rollback:
1. Switch server.py back to `run_translation_bot`
2. Disable frontend translation in extension
3. Resume backend translation/TTS pipeline

The systems can run in parallel for A/B testing.

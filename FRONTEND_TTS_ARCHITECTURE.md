# Frontend TTS Architecture Proposal

## Current Architecture (Backend TTS)
```
Browser → Audio → Backend → Deepgram STT → Translation → Fish Audio TTS → Audio → Browser
```

## Proposed Architecture (Frontend TTS)
```
Browser → Audio → Backend → Deepgram STT → Translation → Text → Browser → Web Speech API/TTS
```

## Benefits of Frontend TTS

### 1. **Reduced Backend Load**
- TTS processing moved to client
- Backend only handles STT and translation
- More scalable for multiple users

### 2. **Lower Bandwidth Usage**
- Send text (few KB) instead of audio (hundreds of KB)
- Faster response times
- Better for mobile users

### 3. **User Control**
- Users can select their preferred voice
- Adjust speech rate and pitch
- Replay translations without re-processing

### 4. **Simpler Architecture**
- Backend becomes text-only pipeline
- Easier to debug and maintain
- No audio synchronization issues

### 5. **Better Error Recovery**
- If TTS fails, user still sees text
- Can retry TTS without re-translating
- More robust user experience

## Implementation Changes

### Backend (bot.py)
```python
# Remove TTS components
async def run_translation_bot(websocket_client, reference_id, target_lang):
    # ... existing STT and translation setup ...
    
    # Simplified pipeline without TTS
    pipeline = Pipeline([
        transport.input(),
        stt,                      # Speech to text
        sentence_aggregator,      # Buffer sentences
        context_manager,          # Manage context
        llm,                      # Translate
        translation_sender,       # Send text to frontend
        transport.output(),       # No TTS needed
    ])
```

### Frontend (Extension)
```javascript
// Use Web Speech API for TTS
function speakTranslation(text, language) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language; // e.g., 'es-ES' for Spanish
    utterance.rate = 1.0; // Adjustable by user
    speechSynthesis.speak(utterance);
}

// Or use a client-side TTS library like:
// - Microsoft Cognitive Services Speech SDK
// - Google Cloud Text-to-Speech (client library)
// - Amazon Polly (client SDK)
```

## Migration Path

1. **Phase 1**: Keep backend TTS but also send text
2. **Phase 2**: Add frontend TTS as optional feature
3. **Phase 3**: Make frontend TTS default, backend TTS optional
4. **Phase 4**: Remove backend TTS completely

## Considerations

### Pros:
- ✅ More scalable
- ✅ Lower latency
- ✅ Better user experience
- ✅ Reduced server costs
- ✅ Works offline (for Web Speech API)

### Cons:
- ❌ Browser compatibility (Web Speech API support varies)
- ❌ Voice quality depends on browser/OS
- ❌ Less control over voice consistency
- ❌ May need fallback for unsupported browsers

## Recommendation

**Move TTS to frontend** for the following reasons:
1. Real-time translation needs low latency - text is faster than audio
2. Users want control over voice settings
3. Backend resources better used for translation
4. Modern browsers have good TTS support
5. Can provide fallback options for compatibility

The architecture becomes cleaner with clear separation:
- **Backend**: Audio → Text → Translation
- **Frontend**: Display + Speech synthesis

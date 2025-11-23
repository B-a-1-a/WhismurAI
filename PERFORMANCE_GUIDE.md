# WhismurAI Performance Optimization Guide

## 🚀 For Absolute Minimum Latency

Your system is now **optimized for the lowest possible latency**. Here's what's been configured:

### Current Configuration (Optimized)

```
Audio Input → Deepgram STT (200-300ms) → GPT-4o-mini (300-500ms) → Fish Audio (low latency) → Audio Output
```

**Total Expected Latency: ~800ms - 1.2s**

## Performance Settings

### 1. STT Service (Speech-to-Text)

**RECOMMENDED: Deepgram (Default)**
- ✅ Latency: 200-300ms
- ✅ Cloud-based, optimized for streaming
- ✅ Best accuracy-to-speed ratio
- ⚠️ Requires API key and internet

**Alternative: Whisper Tiny**
- ⚠️ Latency: 500-1000ms (even on GPU)
- ✅ Free, local processing
- ⚠️ Lower accuracy than Deepgram
- ⚠️ Requires good hardware

### 2. Fish Audio TTS Settings

**Current: `latency="low"`** (Optimized)
- Low latency mode prioritizes speed over quality
- Best for real-time translation

**Alternative: `latency="balanced"`**
- Better quality but ~100-200ms slower

### 3. Translation Model

**Current: `gpt-4o-mini`** (Fastest GPT-4)
- Latency: 300-500ms
- Best balance of speed and quality

## Latency Breakdown

| Component | Deepgram | Whisper Tiny | Whisper Base |
|-----------|----------|--------------|--------------|
| STT       | 200-300ms| 500-1000ms   | 1000-2000ms  |
| LLM       | 300-500ms| 300-500ms    | 300-500ms    |
| TTS (Low) | 200-300ms| 200-300ms    | 200-300ms    |
| **Total** | **~800ms-1.2s** | **~1.2-2s** | **~1.8-3s** |

## Usage

### Default (Deepgram - Fastest)

The system now uses Deepgram by default. Just start normally:

```bash
cd backend
uvicorn server:app --reload
```

Your extension will automatically use the fastest configuration!

### Switch to Whisper

To use Whisper instead, modify `extension/public/offscreen.js` line 73:

```javascript
// Use Whisper (slower, local)
const url = `ws://localhost:8000/ws/translate/${targetLang}?stt=whisper`;

// Use Deepgram (faster, cloud) - DEFAULT
const url = `ws://localhost:8000/ws/translate/${targetLang}`;
```

## Further Optimization Tips

### 1. Reduce Audio Chunk Size

In `extension/public/offscreen.js` line 97, reduce the buffer size:

```javascript
// Current (balanced)
processor = audioContext.createScriptProcessor(4096, 1, 1);

// Faster (more CPU usage)
processor = audioContext.createScriptProcessor(2048, 1, 1);

// Fastest (highest CPU usage)
processor = audioContext.createScriptProcessor(1024, 1, 1);
```

**Trade-off:** Smaller chunks = lower latency but more CPU usage

### 2. Use Faster Translation Prompt

In `backend/bot.py` line 126, use a more concise prompt:

```python
# Current
"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation, no explanations or additional text."

# Faster (even more concise)
f"Translate to {target_lang}:"
```

### 3. Network Optimization

- Use a wired connection instead of WiFi
- Ensure your backend server is on localhost (not remote)
- Close other applications using network bandwidth

### 4. Hardware Acceleration

For Whisper (if you choose to use it):

**NVIDIA GPU (CUDA):**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

**Apple Silicon (MPS):**
Already optimized - no additional steps needed

**CPU Only:**
Use Deepgram instead for best results

## Monitoring Performance

Add this to `backend/bot.py` to log latency:

```python
import time

# Before STT
start_time = time.time()

# After TTS
end_time = time.time()
print(f"Pipeline latency: {(end_time - start_time)*1000:.0f}ms")
```

## Expected Results

### Deepgram Configuration (Recommended)
- **First word**: 800ms - 1.2s
- **Consistent latency**: Yes
- **Quality**: Excellent
- **Cost**: API usage fees

### Whisper Tiny Configuration
- **First word**: 1.2s - 2s
- **Consistent latency**: Varies by hardware
- **Quality**: Good
- **Cost**: Free (local)

## Troubleshooting Slow Performance

### If latency is >3 seconds:

1. **Check which STT service is running:**
   ```
   # Look for this in terminal when starting
   [Bot] Using Deepgram STT (cloud API - RECOMMENDED FOR LOW LATENCY)
   # or
   [Bot] Using Whisper STT (local transcription)
   ```

2. **Verify Fish Audio latency setting:**
   ```python
   # In bot.py, should be:
   latency="low"  # NOT "balanced" or "high"
   ```

3. **Check network connection:**
   - Deepgram requires stable internet
   - High ping = higher latency

4. **Disable speaker diarization:**
   ```javascript
   // Don't add diarization=true to URL
   const url = `ws://localhost:8000/ws/translate/${targetLang}`;
   ```

## API Keys Required

For fastest performance (Deepgram):

```env
DEEPGRAM_API_KEY=your_key_here  # Required for Deepgram
OPENAI_API_KEY=your_key_here    # Required for translation
FISH_API_KEY=your_key_here      # Required for TTS
```

## Comparison Chart

```
Speed vs Quality Trade-offs:

Fastest (Current Config):
Deepgram + GPT-4o-mini + Fish Low
├── Latency: ★★★★★ (800ms-1.2s)
├── Quality: ★★★★☆ (Excellent)
└── Cost: $$$ (API fees)

Balanced:
Whisper Tiny + GPT-4o-mini + Fish Low
├── Latency: ★★★☆☆ (1.2s-2s)
├── Quality: ★★★☆☆ (Good)
└── Cost: $ (OpenAI + Fish only)

High Quality:
Whisper Base + GPT-4 + Fish Balanced
├── Latency: ★★☆☆☆ (2s-3s)
├── Quality: ★★★★★ (Best)
└── Cost: $$ (OpenAI + Fish only)
```

## Summary

**For your use case (real-time extension with minimal latency):**

✅ **Use Deepgram STT** (already set as default)
✅ **Use Fish Audio `latency="low"`** (already configured)
✅ **Keep diarization OFF** (default)
✅ **Use GPT-4o-mini** (already configured)

Your system is now optimized for the fastest possible performance!

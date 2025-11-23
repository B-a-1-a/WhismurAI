# Whisper & Pyannote Integration Guide

This guide explains how to use the new Whisper STT and Pyannote speaker diarization features in WhismurAI.

## Overview

WhismurAI now supports two STT (Speech-to-Text) options:

1. **Whisper** (Local, OpenAI's open-source model) - NEW
2. **Deepgram** (Cloud API) - Original

Additionally, you can enable **Pyannote speaker diarization** to identify different speakers in the audio stream.

## Installation

### 1. Install Dependencies

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install all required packages
pip install -r requirements.txt
```

### 2. Additional Setup for Pyannote (Optional)

If you want to use speaker diarization, you'll need a Hugging Face token:

1. Create a free account at [https://huggingface.co](https://huggingface.co)
2. Get your token at [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
3. Accept the model terms at [https://huggingface.co/pyannote/speaker-diarization](https://huggingface.co/pyannote/speaker-diarization)
4. Add to your `.env` file:

```env
HUGGINGFACE_TOKEN=your_token_here
```

### 3. GPU Acceleration (Recommended)

For best performance with Whisper and Pyannote:

**CUDA (NVIDIA GPU):**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

**Mac (Apple Silicon MPS):**
```bash
# Already included in requirements.txt - no extra steps needed
```

**CPU Only:**
```bash
# Works but will be slower - no extra steps needed
```

## Usage

### Option 1: Using Whisper (Default)

The backend now uses Whisper by default. Simply start the server and extension as normal:

```bash
cd backend
uvicorn server:app --reload
```

Your extension will now use Whisper for transcription!

### Option 2: Using Deepgram (Cloud API)

To use Deepgram instead, modify the WebSocket URL in your extension to include `?stt=deepgram`:

In `extension/public/offscreen.js`, line 73:

```javascript
// Use Deepgram
const url = `ws://localhost:8000/ws/translate/${targetLang}?stt=deepgram`;

// Or use Whisper (default)
const url = `ws://localhost:8000/ws/translate/${targetLang}?stt=whisper`;
```

### Option 3: Enable Speaker Diarization

To enable speaker diarization, add `diarization=true` to the URL:

```javascript
const url = `ws://localhost:8000/ws/translate/${targetLang}?stt=whisper&diarization=true`;
```

This will identify different speakers and log speaker changes.

## Configuration Options

### WebSocket Query Parameters

- `stt` - Choose STT service: `"whisper"` (default) or `"deepgram"`
- `diarization` - Enable speaker diarization: `"true"` or `"false"` (default)
- `reference_id` - Fish Audio voice ID (optional)

**Examples:**

```javascript
// Whisper only (default)
ws://localhost:8000/ws/translate/es

// Whisper with speaker diarization
ws://localhost:8000/ws/translate/es?stt=whisper&diarization=true

// Deepgram without diarization
ws://localhost:8000/ws/translate/es?stt=deepgram

// Custom voice + Whisper + Diarization
ws://localhost:8000/ws/translate/es?stt=whisper&diarization=true&reference_id=YOUR_VOICE_ID
```

### Whisper Model Selection

You can change the Whisper model size in `backend/bot.py` (line 99):

```python
stt = WhisperSTTService(
    model="base",  # Options: tiny, base, small, medium, large
    language=None,  # Auto-detect or specify: "en", "es", etc.
)
```

**Model Comparison:**

| Model  | Size  | Speed | Accuracy | Best For           |
|--------|-------|-------|----------|--------------------|
| tiny   | 39M   | Fast  | Low      | Testing            |
| base   | 74M   | Fast  | Good     | Real-time (default)|
| small  | 244M  | Med   | Better   | Quality balance    |
| medium | 769M  | Slow  | High     | High quality       |
| large  | 1550M | Slowest| Highest| Offline processing |

## Performance Tips

### For Real-Time Translation

1. **Use GPU** - Whisper runs much faster on GPU
2. **Choose smaller model** - `tiny` or `base` for real-time performance
3. **Disable diarization** - Speaker diarization adds overhead
4. **Consider Deepgram** - For lowest latency, use Deepgram cloud API

### For Best Quality

1. **Use larger model** - `medium` or `large` for better transcription
2. **Enable diarization** - Track multiple speakers
3. **Use GPU** - Required for larger models

## Troubleshooting

### Whisper is too slow

**Solution:** Use a smaller model or enable GPU acceleration

```python
# In bot.py, line 99
stt = WhisperSTTService(model="tiny")  # Fastest model
```

### Pyannote not loading

**Solution:** Ensure you have a valid Hugging Face token and accepted the model terms

```bash
# Check your .env file has:
HUGGINGFACE_TOKEN=your_token_here
```

### Import errors

**Solution:** Reinstall dependencies

```bash
pip install --upgrade -r requirements.txt
```

### CUDA/GPU not detected

**Solution:** Install PyTorch with CUDA support

```bash
pip uninstall torch torchvision torchaudio
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Out of memory errors

**Solution:** Use a smaller Whisper model or disable diarization

```python
# Use tiny model
stt = WhisperSTTService(model="tiny")
```

## Architecture

### Pipeline Flow

**With Whisper + Diarization:**
```
Audio Input → Pyannote Diarization → Whisper STT → OpenAI Translation → Fish TTS → Audio Output
```

**With Whisper Only:**
```
Audio Input → Whisper STT → OpenAI Translation → Fish TTS → Audio Output
```

**With Deepgram (Original):**
```
Audio Input → Deepgram STT → OpenAI Translation → Fish TTS → Audio Output
```

## Files Created/Modified

### New Files
- `backend/whisper_stt.py` - Custom Whisper STT service
- `backend/pyannote_diarization.py` - Speaker diarization processor
- `WHISPER_PYANNOTE_SETUP.md` - This guide

### Modified Files
- `backend/requirements.txt` - Added Whisper and Pyannote dependencies
- `backend/bot.py` - Updated to support multiple STT services
- `backend/server.py` - Added query parameters for configuration

## API Reference

### WhisperSTTService

```python
WhisperSTTService(
    model: str = "base",      # Model size: tiny, base, small, medium, large
    language: str = None,     # Source language (None = auto-detect)
    device: str = None        # Device: cuda, mps, cpu (None = auto)
)
```

### PyannoteSpeakerDiarizationProcessor

```python
PyannoteSpeakerDiarizationProcessor(
    auth_token: str = None    # Hugging Face token (required for diarization)
)
```

## Next Steps

1. **Test the integration** - Try both Whisper and Deepgram
2. **Benchmark performance** - Compare latency and quality
3. **Optimize settings** - Find the best model/configuration for your use case
4. **Add UI controls** - Let users choose STT service from the extension UI

## Support

For issues or questions:
- Check the troubleshooting section above
- Review server logs for detailed error messages
- Open an issue on GitHub with logs and configuration details

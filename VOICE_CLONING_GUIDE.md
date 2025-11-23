# 🎤 Voice Cloning Guide for WhismurAI

Complete guide to using Fish Audio's voice cloning for personalized real-time translation.

## Overview

WhismurAI now supports **voice cloning** - translate audio in someone's own voice or any custom voice you create! This is perfect for:

- 🎬 Dubbing videos in the speaker's voice
- 📞 Live calls with personalized translation voices
- 🎭 Character voices for content creation
- 🌐 Maintaining speaker identity across languages

## Quick Start

### 1. Get Your Fish Audio API Key

1. Sign up at [Fish Audio](https://fish.audio/)
2. Go to your dashboard
3. Generate an API key
4. Add to `backend/.env`:

```env
FISH_API_KEY=your_api_key_here
```

### 2. Use Pre-made Voices (Easiest)

Fish Audio provides pre-made voices. Find them at:
- Fish Audio Voice Library: https://fish.audio/voices

Use a voice by its ID:

```javascript
// In your extension's offscreen.js (line 73)
const url = `ws://localhost:8000/ws/translate/es?reference_id=YOUR_VOICE_ID`;
```

### 3. Create Your Own Voice Clone

Use the voice manager utility:

```bash
cd backend
python voice_manager.py
```

Follow the interactive prompts to:
- Upload an audio sample (10-30 seconds recommended)
- Name your voice
- Get a voice ID to use

## Voice Manager Utility

### Installation

Already included! Just run:

```bash
cd backend
python voice_manager.py
```

### Features

**1. List All Voices**
```bash
# See all your voice clones and their IDs
```

**2. Create Voice Clone**
```bash
# Upload audio file
# Name the voice
# Get voice ID instantly
```

**3. Test Voice**
```bash
# Generate sample audio with your clone
# Verify quality before using
```

**4. Get Voice Details**
```bash
# View voice metadata
# Check language, gender, etc.
```

**5. Delete Voice**
```bash
# Remove unused voices
```

## Creating High-Quality Voice Clones

### Audio Requirements

**Optimal Audio Specifications:**
- Duration: 10-30 seconds
- Format: WAV, MP3, M4A, FLAC
- Quality: Clear, minimal background noise
- Content: Natural speech (not singing or shouting)
- Language: Match the voice's primary language

**Best Practices:**

✅ **DO:**
- Use high-quality recordings
- Include varied intonation
- Record in a quiet environment
- Use the target speaker's native language
- Include natural pauses and emotion

❌ **DON'T:**
- Use noisy/compressed audio
- Include music or background sounds
- Use AI-generated voices
- Use copyrighted content without permission
- Submit very short clips (<5 seconds)

### Example: Clone Voice from Audio File

```bash
cd backend
python voice_manager.py
```

Then select option 3 and provide:

```
Audio file path: /path/to/speaker_sample.wav
Voice name: John's Voice
Description: English male speaker
Language: en
```

Output:
```
✅ Voice clone created successfully!
   Voice ID: abc123def456

💡 Use this ID in your .env file or as a query parameter:
   reference_id=abc123def456
```

## Using Voice Clones

### Method 1: Set Default Voice (Recommended)

Edit `backend/server.py` line 22:

```python
# Replace with your voice ID
DEFAULT_VOICE_ID = "abc123def456"
```

Now all translations use this voice by default!

### Method 2: Per-Session Voice Selection

Modify the WebSocket URL with a query parameter:

In `extension/public/offscreen.js` line 73:

```javascript
// Use specific voice for this session
const url = `ws://localhost:8000/ws/translate/es?reference_id=abc123def456`;
```

### Method 3: Dynamic Voice Selection (Advanced)

Update your extension to let users choose voices from a dropdown:

```javascript
// In extension UI
const selectedVoiceId = getUserSelectedVoice(); // Your function
const url = `ws://localhost:8000/ws/translate/es?reference_id=${selectedVoiceId}`;
```

## Programmatic Voice Management

You can also use the VoiceManager class in your own scripts:

```python
from voice_manager import FishAudioVoiceManager

# Initialize
manager = FishAudioVoiceManager()

# List voices
voices = manager.list_voices()

# Create voice clone
voice_id = manager.create_voice_clone(
    audio_file_path="sample.wav",
    voice_name="Custom Voice",
    description="My custom voice clone",
    language="en"
)

# Test the voice
manager.test_voice(voice_id, "Hello, testing my voice clone!")

# Get details
details = manager.get_voice_details(voice_id)

# Delete voice
manager.delete_voice(voice_id)
```

## Multi-Language Voice Support

Fish Audio voices can speak multiple languages! Create one voice and use it across translations:

```javascript
// Same voice speaking different languages
ws://localhost:8000/ws/translate/es?reference_id=YOUR_VOICE_ID  // Spanish
ws://localhost:8000/ws/translate/fr?reference_id=YOUR_VOICE_ID  // French
ws://localhost:8000/ws/translate/ja?reference_id=YOUR_VOICE_ID  // Japanese
```

**Note:** Quality varies by language. Voices work best in their native language and similar languages.

## Advanced Configuration

### Optimize Voice Settings

In `backend/bot.py`, the Fish Audio TTS is configured with optimal settings:

```python
tts = FishAudioTTSService(
    api_key=os.getenv("FISH_API_KEY"),
    reference_id=reference_id,  # Your voice ID
    model_id="speech-1.5",      # Latest model
    output_format="pcm",         # Lowest latency
    sample_rate=24000,           # High quality
    params=InputParams(
        latency="balanced",      # Balance speed/quality
        normalize=True,          # Consistent volume
        prosody_speed=1.0,       # Normal speed (0.5-2.0)
        prosody_volume=0,        # Normal volume
    )
)
```

### Adjust Speaking Speed

Change `prosody_speed` for faster/slower speech:

```python
prosody_speed=0.8,  # 20% slower
prosody_speed=1.2,  # 20% faster
prosody_speed=1.5,  # 50% faster
```

### Adjust Volume

Change `prosody_volume` (in dB):

```python
prosody_volume=-3,  # Quieter
prosody_volume=3,   # Louder
```

## Troubleshooting

### "Voice ID not found"

**Solution:** Verify the voice ID exists:

```bash
python voice_manager.py
# Select option 1 to list all voices
```

### "Poor voice quality"

**Solutions:**
1. Use better source audio (longer, clearer)
2. Try `latency="normal"` for better quality (slightly slower)
3. Recreate the voice with improved audio sample

### "Voice doesn't sound right in target language"

**Solutions:**
1. Use voices trained on similar languages
2. Create separate voices for different language families
3. Test with multiple voices to find best match

### "API rate limits"

**Solutions:**
1. Check your Fish Audio plan limits
2. Reduce translation frequency
3. Upgrade your Fish Audio plan

## Cost Optimization

Fish Audio charges based on:
- Characters synthesized
- Voice cloning storage
- API requests

**Tips to reduce costs:**
1. Delete unused voice clones
2. Use shorter translations (concise prompts)
3. Cache common phrases (advanced)
4. Monitor usage in Fish Audio dashboard

## Legal & Ethical Considerations

⚠️ **Important:**

- Only clone voices with explicit permission
- Don't use copyrighted content without authorization
- Comply with voice cloning laws in your jurisdiction
- Clearly disclose when voice is cloned/AI-generated
- Respect privacy and consent

## Examples

### Example 1: Personal Voice for Language Learning

```bash
# Record yourself saying a paragraph in English
# Create voice clone
python voice_manager.py
# Choose option 3, upload your audio
# Use the voice ID to hear yourself speaking Spanish!
```

### Example 2: Multiple Character Voices

```python
# Create different voices for different use cases
ceo_voice = manager.create_voice_clone("ceo.wav", "CEO Voice", language="en")
narrator_voice = manager.create_voice_clone("narrator.wav", "Narrator", language="en")

# Switch between them as needed
```

### Example 3: Testing Voice Before Using

```bash
python voice_manager.py
# Option 4: Test voice
# Enter voice ID
# Listen to sample before deploying
```

## API Reference

### VoiceManager Methods

```python
# List all voices
voices = manager.list_voices()
# Returns: List[Dict] with voice metadata

# Get specific voice
voice = manager.get_voice_details(voice_id)
# Returns: Dict with voice info

# Create voice clone
voice_id = manager.create_voice_clone(
    audio_file_path: str,
    voice_name: str,
    description: str = "",
    language: str = "en"
)
# Returns: str (voice_id) or None

# Test voice
success = manager.test_voice(voice_id, text)
# Returns: bool

# Delete voice
success = manager.delete_voice(voice_id)
# Returns: bool
```

## Resources

- **Fish Audio Dashboard**: https://fish.audio/dashboard
- **Fish Audio API Docs**: https://docs.fish.audio/
- **Pipecat Fish Integration**: https://docs.pipecat.ai/server/services/tts/fish
- **Voice Library**: https://fish.audio/voices

## Next Steps

1. ✅ Create your first voice clone
2. ✅ Test it with the voice manager
3. ✅ Use it in your translation pipeline
4. ✅ Optimize settings for your use case
5. ✅ Share your translated content!

## Support

Having issues with voice cloning?

1. Check the troubleshooting section above
2. Review Fish Audio documentation
3. Test with default voices first
4. Verify API key and permissions
5. Open an issue on GitHub with details

---

**Happy voice cloning! 🎤✨**

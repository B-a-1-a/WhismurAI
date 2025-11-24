# Voice Cloning Setup Guide

This guide explains how to set up and use the Fish Audio voice cloning feature in WhismurAI.

## Overview

WhismurAI now supports automatic voice cloning using Fish Audio. The extension can:
- Capture the first 10 seconds of speaker audio from any tab
- Create a custom voice model using Fish Audio API
- Use the cloned voice for translated speech output
- Store voice models per URL for future use

## Prerequisites

### 1. Fish Audio API Key

You need a Fish Audio API key to use voice cloning:

1. Sign up at [https://fish.audio](https://fish.audio)
2. Navigate to your API settings
3. Generate a new API key
4. Copy the API key for use in backend configuration

### 2. Backend Environment Variables

Create a `.env` file in the `backend/` directory with the following content:

```bash
# Required for Speech-to-Text
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Required for Voice Cloning and TTS
FISH_AUDIO_API_KEY=your_fish_audio_api_key_here

# Optional - for OpenAI translation (bot.py)
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Frontend Extension Setup

The Fish Audio API key also needs to be accessible to the extension for TTS:

1. Open the extension popup
2. The extension will automatically use the backend API for voice cloning
3. TTS will use Fish Audio when a cloned voice is available

## How It Works

### Automatic Voice Cloning Flow

1. **User starts translation** → Click "Start Translation" in the extension popup
2. **Audio capture begins** → Extension captures tab audio for translation
3. **Voice buffering** (first 10 seconds) → A separate buffer captures audio for cloning
4. **Voice model creation** → After 10 seconds, audio is sent to backend
5. **Backend processing** → Fish Audio creates a custom voice model
6. **Notification** → Browser notification: "Voice cloned! Would you like to use it?"
7. **Model storage** → Voice model ID is stored and associated with the current URL
8. **Toggle available** → UI shows a toggle to enable/disable the cloned voice

### Using Cloned Voices

Once a voice is cloned:

1. A new "Voice Cloning" section appears in the popup
2. Status indicator shows:
   - 🟡 Capturing (first 10 seconds)
   - 🔵 Processing (creating model)
   - 🟢 Ready (model available)
   - 🔴 Error (if something failed)
3. Toggle switch to enable/disable cloned voice
4. "Using cloned voice" or "Using default voice" indicator

### Voice Model Persistence

- Voice models are stored per URL
- When you revisit a page with a cloned voice, it's automatically available
- Models persist across browser sessions
- You can have different cloned voices for different websites

## API Endpoints

### Clone Voice

**POST** `/api/clone-voice`

Creates a Fish Audio voice model from uploaded audio.

**Request:**
```
Content-Type: multipart/form-data

audio: <audio file> (WAV or MP3, minimum 5 seconds)
url: <source URL>
title: <optional custom title>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "model_id": "abc123...",
    "title": "Cloned Voice - example.com",
    "url": "https://example.com/video",
    "hostname": "example.com"
  }
}
```

### List Voice Models

**GET** `/api/voice-models`

Returns all stored voice models.

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "url": "https://example.com/video",
      "model_id": "abc123...",
      "title": "Cloned Voice - example.com",
      "hostname": "example.com",
      "created_at": 1234567890
    }
  ]
}
```

### Get Voice Model

**GET** `/api/voice-models/{url}`

Get voice model for a specific URL.

### Delete Voice Model

**DELETE** `/api/voice-models/{url}`

Delete voice model for a specific URL.

## Technical Details

### Audio Processing

- **Capture duration**: 10 seconds
- **Format**: WAV, 16-bit PCM, mono
- **Sample rate**: Matches AudioContext (typically 48kHz or 44.1kHz)
- **Minimum quality**: At least 5 seconds of clean audio required

### Fish Audio Integration

- **SDK**: Uses `fish-audio-sdk` Python package
- **Model visibility**: Private (only you can use your cloned voices)
- **Training mode**: Fast (models ready immediately)
- **API endpoint**: `https://api.fish.audio/v1/tts`

### Storage

- **Backend**: JSON file (`backend/voice_models.json`)
- **Frontend**: Chrome storage (`chrome.storage.local`)
- **Key**: Full URL of the page where voice was cloned

## Troubleshooting

### Voice cloning fails

**Error:** "No audio captured for voice cloning"
- **Solution**: Ensure the tab has active audio playing
- Check browser permissions for audio capture

**Error:** "Audio too short"
- **Solution**: The capture needs at least 10 seconds of audio
- Make sure audio is playing continuously during capture

### Cloned voice sounds poor quality

- Try cloning from a source with:
  - Clear speech (no background music/noise)
  - Consistent speaker (single person)
  - Good audio quality (not compressed/distorted)
  
### Toggle not working

- **Solution**: Make sure you're actively translating
- Toggle is only enabled during active translation sessions
- Check that FISH_AUDIO_API_KEY is set in backend

### Backend API errors

**Error:** "FISH_AUDIO_API_KEY not found"
- **Solution**: Add the API key to `backend/.env` file
- Restart the backend server after adding the key

**Error:** "Fish Audio API error: 401"
- **Solution**: Your API key is invalid or expired
- Generate a new API key from Fish Audio dashboard

## Best Practices

### For Best Voice Cloning Results

1. **Choose quality sources**: Clone from clear, high-quality audio
2. **Single speaker**: Ensure only one person is speaking during capture
3. **Minimal background noise**: Avoid music, ambient sounds
4. **Natural speech**: Longer sentences work better than short phrases
5. **Consistent audio**: Steady volume throughout capture period

### Managing Voice Models

- **Per-URL storage**: Each page gets its own voice model
- **Cleanup**: Delete unused models via API to save storage
- **Re-cloning**: Simply start a new translation session to re-clone
- **Backup**: Export `voice_models.json` to backup your models

## Using Cloned Voices for TTS

### Setting Up Your Fish Audio API Key

To use cloned voices for Text-to-Speech, you need to provide your Fish Audio API key in the extension:

**Steps:**
1. Get your API key from [fish.audio](https://fish.audio)
2. In the WhismurAI popup, click the ⚙️ icon next to "Voice Cloning"
3. Paste your Fish Audio API key
4. Click "Save"

**How It Works:**
- The API key is stored locally in `chrome.storage`
- When you toggle "Use cloned voice", the key is passed to the TTS service
- Fish Audio API generates speech using your cloned voice model
- Audio is played back in real-time

### Security Note

Your API key is stored locally in your browser's extension storage and never sent anywhere except directly to Fish Audio's API for TTS generation.

## Privacy & Security

- **Private models**: All cloned voices are private to your account
- **Local storage**: Voice model IDs stored locally in browser
- **No sharing**: Models are not shared between users
- **Delete anytime**: Remove models via DELETE endpoint

## Additional Resources

- [Fish Audio Documentation](https://docs.fish.audio)
- [Fish Audio Voice Cloning Guide](https://docs.fish.audio/core-features/creating-models)
- [Pipecat Integration Examples](https://github.com/pipecat-ai/pipecat/tree/main/examples)

## Support

If you encounter issues:
1. Check browser console for error messages
2. Check backend logs for API errors
3. Verify all API keys are correctly set
4. Ensure audio is playing during voice capture

For Fish Audio API issues, contact: [support@fish.audio](mailto:support@fish.audio)


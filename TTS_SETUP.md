# Fish Audio TTS Setup

## Changes Made

This document summarizes the changes made to send transcripts directly to Fish Audio TTS and mute the video during playback.

### Backend Changes (`backend/bot.py`)

1. **Removed Translation Step**: Bypassed the OpenAI LLM translation entirely
2. **Added TranscriptToTTS Processor**: Created a new processor that converts `TranscriptionFrame` to `TTSTextFrame`
3. **Integrated Fish Audio TTS**: Uncommented and configured the Fish Audio TTS service in the pipeline
4. **Simplified Pipeline**: New flow is:
   - Input Transport → Deepgram STT → Sentence Aggregator → Transcript to TTS → Fish Audio TTS → Output Transport

### Frontend Changes

#### 1. Content Script (`extension/public/content.js` & `extension/dist/content.js`)
- **New file**: Created a content script to control video muting
- Listens for `MUTE_VIDEO` and `UNMUTE_VIDEO` messages
- Stores original video state (muted/volume) and restores it after TTS playback
- Handles multiple videos on the same page

#### 2. Manifest Updates (`extension/public/manifest.json` & `extension/dist/manifest.json`)
- Added content_scripts configuration to inject `content.js` into all pages

#### 3. Offscreen Document (`extension/public/offscreen.js`)
- **Enabled Audio Playback**: Uncommented the TTS audio playback code
- **Added Video Muting Logic**: 
  - Mutes video when TTS audio starts playing
  - Unmutes video when TTS audio finishes
- **Added Tab ID Tracking**: Stores active tab ID to send mute/unmute messages
- **Audio Scheduling**: Uses `onended` event to detect when TTS finishes

#### 4. Background Script (`extension/public/background.js`)
- Passes `tabId` to offscreen document along with `streamId` and `targetLang`

## How It Works

1. **User starts translation** → Audio capture begins
2. **Deepgram transcribes** audio → Transcription sent to backend
3. **Sentence Aggregator** buffers and forms complete sentences
4. **TranscriptToTTS** converts transcript to TTS frame
5. **Fish Audio TTS** generates audio from the transcript
6. **Audio sent to frontend** → Offscreen document receives PCM audio chunks
7. **Video mutes** → Content script mutes all `<video>` elements on the page
8. **TTS plays** → Audio plays through the browser
9. **Video unmutes** → When TTS finishes, content script restores original video state

## Environment Setup

Make sure you have the following environment variables set in `backend/.env`:

```bash
DEEPGRAM_API_KEY=your_deepgram_api_key
FISH_AUDIO_API_KEY=your_fish_audio_api_key
OPENAI_API_KEY=your_openai_api_key  # Optional, not used in TTS-only mode
```

## Voice Configuration

The default Fish Audio voice ID is set in `backend/server.py`:
```python
DEFAULT_VOICE_ID = "7f92f8afb8ec43bf81429cc1c9199cb1"
```

You can change this to use a different voice from your Fish Audio account.

## Testing

1. Start the backend server:
   ```bash
   cd backend
   source venv/bin/activate
   python server.py
   ```

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable Developer Mode
   - Load unpacked → Select `extension/dist` folder

3. Open a video tab (e.g., YouTube) and click the extension
4. Click "Start Translation"
5. Speak or play audio → You should:
   - See transcripts appear in the extension popup
   - Hear TTS audio playing back
   - Notice the video mutes during TTS and unmutes after

## Troubleshooting

- **No audio playback**: Check browser console for errors, verify Fish Audio API key
- **Video doesn't mute**: Check that content script is injected (look for console logs)
- **TTS not working**: Verify Fish Audio service is initialized (check backend logs)
- **Extension errors**: Open DevTools on the extension popup and check console


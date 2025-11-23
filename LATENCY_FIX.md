# Latency and Video Muting Fixes

## Changes Made

### 1. Fixed TTS Audio Playback (Backend)
**File:** `backend/bot.py`

- **Added imports** for `TTSAudioRawFrame`, `TTSStartedFrame`, `TTSStoppedFrame`
- **Modified `FastAPIOutputTransport`** to handle TTS audio frames:
  - Now explicitly handles `TTSAudioRawFrame` and sends the audio data to WebSocket
  - Filters out `TTSStartedFrame` and `TTSStoppedFrame` to avoid warnings
  - Logs when TTS audio chunks are sent

### 2. Reduced Latency (Backend)
**File:** `backend/bot.py`

#### Deepgram STT Optimization:
- **`endpointing`**: Reduced from 800ms → **300ms** (faster silence detection)
- **`utterance_end_ms`**: Reduced from 1500ms → **1000ms** (faster finalization)

#### Fish Audio TTS Optimization:
- **Added `latency="normal"`** parameter for faster TTS generation
- Options: `"normal"` (faster) or `"balanced"` (higher quality but slower)

### 3. Fixed Video Muting (Extension)
**Files:** `extension/public/content.js`, `extension/public/offscreen.js`, `extension/public/background.js`

#### Content Script Improvements:
- **Switched to `WeakMap`** for storing video states (better memory management)
- **Added `MutationObserver`** to handle dynamically added video elements
- **Better logging** to debug muting issues
- **Improved state restoration** logic

#### Message Flow Fix:
- **Offscreen → Background → Content Script**:
  - Offscreen sends `MUTE_TAB_VIDEO`/`UNMUTE_TAB_VIDEO` to background
  - Background forwards `MUTE_VIDEO`/`UNMUTE_VIDEO` to content script in the correct tab
  - This ensures proper message routing in Chrome's Manifest V3 architecture

## Expected Improvements

### Latency Reduction:
- **Before**: ~2-3 seconds from speech to TTS playback
- **After**: ~1-1.5 seconds from speech to TTS playback

### Video Muting:
- **Before**: Video audio continued playing during TTS
- **After**: Video automatically mutes when TTS starts and unmutes when TTS finishes

## Testing

1. **Reload the extension** in Chrome (`chrome://extensions/` → click reload button)
2. **Restart the backend** (it should auto-reload with uvicorn)
3. **Open a YouTube video** or any video page
4. **Start translation** and speak or play audio
5. **Verify**:
   - TTS audio plays back quickly
   - Video mutes during TTS playback
   - Video unmutes after TTS finishes
   - Check browser console for `[Content]`, `[Offscreen]`, and `[Output]` logs

## Troubleshooting

### If TTS audio still doesn't play:
- Check browser console for `[Output] Sending TTS audio chunk` logs
- Check offscreen console for `[Offscreen] Received audio chunk` logs
- Verify Fish Audio API key is valid

### If video doesn't mute:
- Check browser console on the video page for `[Content]` logs
- Verify content script is loaded: Look for `[Content] WhismurAI content script loaded`
- Check background service worker console for `[Background] Forwarding MUTE_VIDEO` logs
- Try refreshing the video page after loading the extension

### If latency is still high:
- Check your network connection to Fish Audio API
- Consider reducing `endpointing` to 200ms (may cause more interruptions)
- Check Fish Audio dashboard for API performance metrics


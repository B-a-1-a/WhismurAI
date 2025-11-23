# Debugging Video Mute Issue

## Enhanced Logging Added

I've added comprehensive logging with emojis to make it easy to trace the message flow:

### 1. Content Script Logs (Video Page Console)
Open DevTools on the **video page** (e.g., YouTube):
- `[Content] WhismurAI content script loaded on: <URL>` - Script is injected
- `[Content] Received message: MUTE_VIDEO Current videos on page: X` - Message received
- `[Content] Attempting to mute X video(s)` - Muting attempt
- `[Content] ✅ Muted video 1/X` - Successfully muted
- `[Content] ⚠️ No video elements found on the page!` - No videos detected

### 2. Offscreen Document Logs
Open DevTools on the extension (Extensions page → Offscreen document):
- `[Offscreen] 🎵 First TTS audio chunk, muting video...` - TTS started
- `[Offscreen] 🔇 muteVideo() called, activeTabId: X` - Mute function called
- `[Offscreen] Sending MUTE_TAB_VIDEO message to background for tab: X` - Message sent
- `[Offscreen] ✅ Mute message acknowledged` - Background confirmed receipt
- `[Offscreen] ❌ Cannot mute: activeTabId is not set!` - **ERROR**: Tab ID missing

### 3. Background Service Worker Logs
Open DevTools on the extension (Extensions page → Service Worker):
- `[Background] Forwarding MUTE_VIDEO to tab: X` - Forwarding to content script
- `[Background] Mute message sent successfully` - Content script received it
- `[Background] Failed to send mute message: <error>` - **ERROR**: Message failed

## Step-by-Step Debugging

### Step 1: Check Content Script Injection
1. Go to your video page (e.g., YouTube)
2. Open DevTools Console (F12)
3. Look for: `[Content] WhismurAI content script loaded on: <URL>`

**If you DON'T see this:**
- The content script is not injected
- **Solution**: Reload the extension, then refresh the video page

### Step 2: Test Manual Mute
In the video page console, type:
```javascript
document.querySelectorAll('video')
```

**Expected**: Should show an array with video elements
**If empty**: Videos might be in an iframe or loaded dynamically

### Step 3: Check Tab ID
In the offscreen document console, check when TTS plays:
- Look for: `[Offscreen] 🔇 muteVideo() called, activeTabId: X`
- `X` should be a number (e.g., `1234`)

**If `activeTabId: undefined`**:
- The tab ID is not being passed correctly
- Check background logs for: `[Background] Capturing audio from tab: X`

### Step 4: Check Message Flow
Follow this sequence when TTS plays:

1. **Offscreen**: `[Offscreen] 🔇 muteVideo() called, activeTabId: X`
2. **Background**: `[Background] Forwarding MUTE_VIDEO to tab: X`
3. **Content**: `[Content] Received message: MUTE_VIDEO Current videos on page: Y`
4. **Content**: `[Content] ✅ Muted video 1/Y`

**If the chain breaks**, note where it stops.

## Common Issues & Solutions

### Issue 1: "No video elements found"
**Cause**: Videos loaded after content script, or in iframe
**Solution**: The script now retries after 500ms. If still failing, videos might be in an iframe (not supported).

### Issue 2: "activeTabId is not set"
**Cause**: Tab ID not passed from background to offscreen
**Solution**: Check background.js line ~206 - should send `tabId: tab.id`

### Issue 3: "Failed to send mute message"
**Cause**: Content script not ready to receive messages
**Solution**: Content script now sends `CONTENT_SCRIPT_READY` - check if background receives it

### Issue 4: Videos mute but audio still plays
**Cause**: Page might be using Web Audio API or different audio source
**Solution**: This is a limitation - we can only mute `<video>` elements

## Quick Test

Run this in the **video page console** to manually test muting:
```javascript
// Test manual mute
const videos = document.querySelectorAll('video');
console.log('Found videos:', videos.length);
videos.forEach(v => {
  console.log('Video:', v, 'Muted:', v.muted, 'Volume:', v.volume);
  v.muted = true;
  v.volume = 0;
  console.log('After mute - Muted:', v.muted, 'Volume:', v.volume);
});
```

If manual muting works but the extension doesn't, the issue is in message passing.

## What to Report

When reporting the issue, please provide:

1. **Video page console logs** (filter by `[Content]`)
2. **Offscreen document console logs** (filter by `[Offscreen]`)
3. **Background service worker logs** (filter by `[Background]`)
4. **Result of manual test** (above)
5. **Video page URL** (e.g., YouTube, Vimeo, etc.)

## Next Steps

After reload:
1. **Reload extension** in `chrome://extensions/`
2. **Refresh video page**
3. **Start translation**
4. **Open all 3 consoles** (video page, offscreen, background)
5. **Play audio** and watch the logs
6. **Take screenshots** of logs if muting doesn't work


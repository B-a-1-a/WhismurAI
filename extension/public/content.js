// Content script for controlling video playback (mute/unmute)

console.log('[Content] WhismurAI content script loaded on:', window.location.href);

// Track muted state
let isMuted = false;
let mutedVideos = new WeakMap(); // Store original state per video element

// Notify background that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href })
  .catch(err => console.warn('[Content] Failed to notify ready:', err));

// Listen for messages from background/offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message.type, 'Current videos on page:', document.querySelectorAll('video').length);
  
  if (message.type === 'MUTE_VIDEO') {
    const result = muteAllVideos();
    console.log('[Content] Mute result:', result);
    sendResponse(result);
  } else if (message.type === 'UNMUTE_VIDEO') {
    const result = unmuteAllVideos();
    console.log('[Content] Unmute result:', result);
    sendResponse(result);
  }
  
  return false;
});

function muteAllVideos() {
  const videos = document.querySelectorAll('video');
  console.log('[Content] Attempting to mute', videos.length, 'video(s)');
  console.log('[Content] Document ready state:', document.readyState);
  console.log('[Content] Current URL:', window.location.href);
  
  if (videos.length === 0) {
    console.warn('[Content] ⚠️ No video elements found on the page!');
    console.warn('[Content] DOM may not be ready yet. Trying again in 500ms...');
    
    // Try again after a delay
    setTimeout(() => {
      const retryVideos = document.querySelectorAll('video');
      console.log('[Content] Retry found', retryVideos.length, 'video(s)');
      if (retryVideos.length > 0) {
        retryVideos.forEach(muteVideo);
        isMuted = true;
      }
    }, 500);
    
    return { status: 'no_videos', count: 0 };
  }
  
  videos.forEach((video, index) => {
    muteVideo(video);
    console.log(`[Content] ✅ Muted video ${index + 1}/${videos.length}`);
  });
  
  isMuted = true;
  return { status: 'muted', count: videos.length };
}

function muteVideo(video) {
  // Store original state only if not already muted by us
  if (!mutedVideos.has(video)) {
    mutedVideos.set(video, {
      muted: video.muted,
      volume: video.volume
    });
    console.log('[Content] 💾 Stored original state:', { muted: video.muted, volume: video.volume, src: video.currentSrc?.substring(0, 50) });
  }
  
  video.muted = true;
  video.volume = 0;
}

function unmuteAllVideos() {
  const videos = document.querySelectorAll('video');
  console.log('[Content] Attempting to unmute', videos.length, 'video(s)');
  
  let unmuteCount = 0;
  videos.forEach((video, index) => {
    // Restore original state if we have it
    const originalState = mutedVideos.get(video);
    if (originalState) {
      video.muted = originalState.muted;
      video.volume = originalState.volume;
      mutedVideos.delete(video);
      unmuteCount++;
      console.log(`[Content] ✅ Restored video ${index + 1}/${videos.length}:`, originalState);
    }
  });
  
  isMuted = false;
  console.log(`[Content] Unmuted ${unmuteCount} video(s)`);
  return { status: 'unmuted', count: unmuteCount };
}

// Observe for dynamically added video elements
const observer = new MutationObserver((mutations) => {
  if (isMuted) {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (!mutedVideos.has(video)) {
        mutedVideos.set(video, {
          muted: video.muted,
          volume: video.volume
        });
        video.muted = true;
        video.volume = 0;
        console.log('[Content] Muted newly added video');
      }
    });
  }
});

// Start observing after DOM is ready
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  unmuteAllVideos();
});


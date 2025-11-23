// Content script for controlling video playback (mute/unmute)

console.log('[Content] WhismurAI content script loaded');

// Track muted state
let isMuted = false;
let mutedVideos = new WeakMap(); // Store original state per video element

// Listen for messages from background/offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message.type);
  
  if (message.type === 'MUTE_VIDEO') {
    muteAllVideos();
    sendResponse({ status: 'muted' });
  } else if (message.type === 'UNMUTE_VIDEO') {
    unmuteAllVideos();
    sendResponse({ status: 'unmuted' });
  }
  
  return false;
});

function muteAllVideos() {
  const videos = document.querySelectorAll('video');
  console.log('[Content] Muting', videos.length, 'video(s)');
  
  if (videos.length === 0) {
    console.warn('[Content] No video elements found on the page');
  }
  
  videos.forEach((video) => {
    // Store original state only if not already muted by us
    if (!mutedVideos.has(video)) {
      mutedVideos.set(video, {
        muted: video.muted,
        volume: video.volume
      });
      console.log('[Content] Stored original state for video:', { muted: video.muted, volume: video.volume });
    }
    
    video.muted = true;
    video.volume = 0;
    console.log('[Content] Video muted:', video);
  });
  
  isMuted = true;
}

function unmuteAllVideos() {
  const videos = document.querySelectorAll('video');
  console.log('[Content] Unmuting', videos.length, 'video(s)');
  
  videos.forEach((video) => {
    // Restore original state if we have it
    const originalState = mutedVideos.get(video);
    if (originalState) {
      video.muted = originalState.muted;
      video.volume = originalState.volume;
      mutedVideos.delete(video);
      console.log('[Content] Restored original state for video:', originalState);
    }
  });
  
  isMuted = false;
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


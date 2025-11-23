// Content script for controlling video playback (mute/unmute)

console.log('[Content] WhismurAI content script loaded on:', window.location.href);

// Track muted state
let isMuted = false;
let mutedVideos = new WeakMap(); // Store original state per video element

// Notify background that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: window.location.href })
  .catch(err => {}); // Ignore errors (expected in some iframe contexts)

// Listen for messages from background/offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only log in top frame to avoid spam, unless verbose debugging needed
  if (window === top) {
    console.log('[Content] Received message:', message.type, 'Current media on page:', document.querySelectorAll('video, audio').length);
  }
  
  if (message.type === 'MUTE_VIDEO') {
    const result = muteAllMedia();
    sendResponse(result);
  } else if (message.type === 'UNMUTE_VIDEO') {
    const result = unmuteAllMedia();
    sendResponse(result);
  }
  
  return false;
});

function muteAllMedia() {
  // SEARCH FOR BOTH VIDEO AND AUDIO ELEMENTS
  const mediaElements = document.querySelectorAll('video, audio');
  
  if (mediaElements.length === 0) {
    // Don't warn to avoid spamming console from every ad iframe
    // Just retry silently once
    setTimeout(() => {
      const retryElements = document.querySelectorAll('video, audio');
      if (retryElements.length > 0) {
        retryElements.forEach(muteElement);
        isMuted = true;
      }
    }, 1000);
    
    return { status: 'no_media', count: 0 };
  }
  
  mediaElements.forEach((element) => {
    muteElement(element);
  });
  
  isMuted = true;
  return { status: 'muted', count: mediaElements.length };
}

function muteElement(element) {
  // Store original state
  if (!mutedVideos.has(element)) {
    mutedVideos.set(element, {
      muted: element.muted,
      volume: element.volume
    });
    // console.log('[Content] 💾 Stored state for:', element.tagName);
  }
  
  // Mute
  element.muted = true;
  element.volume = 0;
  
  // Force audio refresh
  const wasPlaying = !element.paused;
  if (wasPlaying) {
    const currentTime = element.currentTime;
    element.pause();
    setTimeout(() => {
      element.currentTime = currentTime;
      element.play().catch(e => {});
    }, 10);
  }
}

function unmuteAllMedia() {
  const mediaElements = document.querySelectorAll('video, audio');
  let unmuteCount = 0;
  
  mediaElements.forEach((element) => {
    const originalState = mutedVideos.get(element);
    if (originalState) {
      element.muted = originalState.muted;
      element.volume = originalState.volume;
      
      // Force refresh
      if (!element.paused) {
        element.pause();
        setTimeout(() => element.play().catch(e => {}), 10);
      }
      
      mutedVideos.delete(element);
      unmuteCount++;
    }
  });
  
  isMuted = false;
  return { status: 'unmuted', count: unmuteCount };
}

// Update Observer to look for both
const observer = new MutationObserver((mutations) => {
  if (isMuted) {
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach((element) => {
      if (!mutedVideos.has(element)) {
        muteElement(element);
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
  unmuteAllMedia();
});

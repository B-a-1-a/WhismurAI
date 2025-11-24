// Content script for controlling video playback (mute/unmute)
// Runs in ALL frames (main page + iframes) to handle embedded content

const isTopFrame = window === window.top;
const frameInfo = isTopFrame ? '[Main Frame]' : '[Iframe]';

console.log(`[Content] ${frameInfo} WhismurAI content script loaded on:`, window.location.href);

// Track muted state
let isMuted = false;
let mutedVideos = new WeakMap(); // Store original state per video element
let mutedAudios = new WeakMap(); // Store original state per audio element

// Notify background that content script is ready
chrome.runtime.sendMessage({ 
  type: 'CONTENT_SCRIPT_READY', 
  url: window.location.href,
  isTopFrame: isTopFrame
}).catch(err => {}); // Ignore errors (expected in some iframe contexts)

// Listen for messages from background/offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log all frames for debugging mute issues
  console.log(`[Content] ${frameInfo} Received message:`, message.type, 'Media elements:', document.querySelectorAll('video, audio').length);
  
  if (message.type === 'MUTE_VIDEO') {
    const result = muteAllMedia();
    console.log(`[Content] ${frameInfo} Mute result:`, result);
    sendResponse(result);
  } else if (message.type === 'UNMUTE_VIDEO') {
    const result = unmuteAllMedia();
    console.log(`[Content] ${frameInfo} Unmute result:`, result);
    sendResponse(result);
  }
  
  return false;
});

function muteAllMedia() {
  // Find ALL video and audio elements including in Shadow DOM
  const mediaElements = findAllMediaElements();
  
  console.log(`[Content] ${frameInfo} Found ${mediaElements.length} media elements to mute`);
  
  if (mediaElements.length === 0) {
    // Retry after a short delay (media might load later)
    setTimeout(() => {
      const retryElements = findAllMediaElements();
      if (retryElements.length > 0) {
        console.log(`[Content] ${frameInfo} Retry found ${retryElements.length} media elements`);
        retryElements.forEach(muteElement);
        isMuted = true;
      }
    }, 1000);
    
    // Also try again after 3 seconds for lazy-loaded content
    setTimeout(() => {
      if (isMuted) {
        const lateElements = findAllMediaElements();
        lateElements.forEach(element => {
          if (!mutedVideos.has(element) && !mutedAudios.has(element)) {
            muteElement(element);
          }
        });
      }
    }, 3000);
    
    return { status: 'no_media', count: 0, frame: frameInfo };
  }
  
  mediaElements.forEach((element) => {
    muteElement(element);
  });
  
  isMuted = true;
  return { status: 'muted', count: mediaElements.length, frame: frameInfo };
}

// Find all media elements including in Shadow DOM
function findAllMediaElements() {
  const elements = [];
  
  // Regular DOM elements
  document.querySelectorAll('video, audio').forEach(el => elements.push(el));
  
  // Check Shadow DOM (used by many video players)
  document.querySelectorAll('*').forEach(element => {
    if (element.shadowRoot) {
      element.shadowRoot.querySelectorAll('video, audio').forEach(el => elements.push(el));
    }
  });
  
  // Check iframes (accessible ones only - same-origin)
  try {
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.querySelectorAll('video, audio').forEach(el => elements.push(el));
        }
      } catch (e) {
        // Cross-origin iframe, can't access (will be handled by content script in that frame)
      }
    });
  } catch (e) {
    // Ignore iframe access errors
  }
  
  return elements;
}

function muteElement(element) {
  const elementMap = element.tagName === 'VIDEO' ? mutedVideos : mutedAudios;
  
  // Store original state
  if (!elementMap.has(element)) {
    elementMap.set(element, {
      muted: element.muted,
      volume: element.volume
    });
    console.log(`[Content] ${frameInfo} 🔇 Muting ${element.tagName} element (was muted: ${element.muted}, volume: ${element.volume})`);
  }
  
  // Mute the element
  element.muted = true;
  element.volume = 0;
  
  // Set muted attribute (helps with some players)
  element.setAttribute('muted', '');
  
  // Force audio refresh if playing
  if (!element.paused) {
    const currentTime = element.currentTime;
    element.pause();
    setTimeout(() => {
      element.currentTime = currentTime;
      element.play().catch(e => {
        console.log(`[Content] ${frameInfo} Could not resume playback after mute:`, e);
      });
    }, 10);
  }
  
  // Watch for unmute attempts by the page
  element.addEventListener('volumechange', handleVolumeChange);
}

// Prevent page from unmuting while we're capturing
function handleVolumeChange(event) {
  if (isMuted) {
    const element = event.target;
    if (element.volume > 0 || !element.muted) {
      console.log(`[Content] ${frameInfo} Page tried to unmute - forcing mute back`);
      element.muted = true;
      element.volume = 0;
    }
  }
}

function unmuteAllMedia() {
  const mediaElements = findAllMediaElements();
  let unmuteCount = 0;
  
  console.log(`[Content] ${frameInfo} Unmuting ${mediaElements.length} media elements`);
  
  mediaElements.forEach((element) => {
    const elementMap = element.tagName === 'VIDEO' ? mutedVideos : mutedAudios;
    const originalState = elementMap.get(element);
    
    if (originalState) {
      // Restore original state
      element.muted = originalState.muted;
      element.volume = originalState.volume;
      
      if (!originalState.muted) {
        element.removeAttribute('muted');
      }
      
      console.log(`[Content] ${frameInfo} 🔊 Unmuting ${element.tagName} (restored muted: ${originalState.muted}, volume: ${originalState.volume})`);
      
      // Remove volume change listener
      element.removeEventListener('volumechange', handleVolumeChange);
      
      // Force refresh if playing
      if (!element.paused) {
        const currentTime = element.currentTime;
        element.pause();
        setTimeout(() => {
          element.currentTime = currentTime;
          element.play().catch(e => {});
        }, 10);
      }
      
      elementMap.delete(element);
      unmuteCount++;
    }
  });
  
  isMuted = false;
  return { status: 'unmuted', count: unmuteCount, frame: frameInfo };
}

// Observer to catch dynamically added media elements
const observer = new MutationObserver((mutations) => {
  if (isMuted) {
    // Check for new media elements (including in Shadow DOM)
    const mediaElements = findAllMediaElements();
    mediaElements.forEach((element) => {
      if (!mutedVideos.has(element) && !mutedAudios.has(element)) {
        console.log(`[Content] ${frameInfo} 🆕 New ${element.tagName} element detected, muting...`);
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

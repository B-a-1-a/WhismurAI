// Background Service Worker for WhismurAI Extension

let isOffscreenCreated = false;
let isOffscreenReady = false;
let offscreenReadyResolvers = [];

function waitForOffscreenReady(timeout = 2000) {
  if (isOffscreenReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      offscreenReadyResolvers = offscreenReadyResolvers.filter(fn => fn !== resolve);
      reject(new Error('Offscreen document did not signal readiness in time'));
    }, timeout);

    offscreenReadyResolvers.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function handleOffscreenReady() {
  isOffscreenReady = true;
  offscreenReadyResolvers.forEach(resolve => resolve());
  offscreenReadyResolvers = [];
}

function sendMessageToOffscreen(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
let sessionState = {
  isTranslating: false,
  targetLang: 'es'
};

let capturedTabId = null; // Track which tab is being captured

// Listen for messages from React UI and Offscreen document
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req?.type === 'OFFSCREEN_READY') {
    console.log('[Background] Offscreen document ready');
    handleOffscreenReady();
    sendResponse({ status: 'ack' });
    return true;
  }

  if (req?.type === 'VOICE_CLONE_STATUS') {
    // Forward voice cloning status to popup
    console.log('[Background] Voice clone status:', req.status, req.message);
    // Broadcast to all extension pages (popup, etc.)
    chrome.runtime.sendMessage(req).catch(() => {});
    sendResponse({ status: 'ok' });
    return true;
  }

  if (req?.type === 'VOICE_CLONE_COMPLETE') {
    // Voice cloning completed - store the model and show notification
    (async () => {
      try {
        const { model_id, url, title, hostname } = req.data;
        console.log('[Background] Voice clone complete:', model_id, 'for', hostname);
        
        // Store voice model in chrome.storage
        const result = await chrome.storage.local.get(['voiceModels']);
        const voiceModels = result.voiceModels || {};
        
        // Use URL as key
        voiceModels[url] = {
          model_id,
          title,
          hostname,
          created_at: Date.now()
        };
        
        await chrome.storage.local.set({ voiceModels });
        console.log('[Background] Voice model stored for:', hostname);
        
        // Show browser notification (without icon to avoid SVG issues)
        try {
          await chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icon.svg'),
            title: 'Voice Cloned Successfully! 🎤',
            message: `Voice from ${hostname} has been cloned. You can now enable it in the popup.`,
            priority: 2,
            requireInteraction: false
          });
        } catch (notifError) {
          console.warn('[Background] Notification failed (non-critical):', notifError);
          // Continue even if notification fails
        }
        
        // Broadcast to popup and all extension pages
        try {
          await chrome.runtime.sendMessage({
            type: 'VOICE_MODEL_AVAILABLE',
            data: { model_id, url, title, hostname }
          });
          console.log('[Background] Broadcast VOICE_MODEL_AVAILABLE message');
        } catch (broadcastError) {
          console.log('[Background] No listeners for VOICE_MODEL_AVAILABLE (popup may be closed)');
        }
        
        sendResponse({ status: 'saved' });
      } catch (error) {
        console.error('[Background] Failed to save voice model:', error);
        sendResponse({ status: 'error', message: error.message });
      }
    })();
    return true;
  }

  if (req?.type === 'SAVE_TRANSCRIPT') {
    // Handle transcript storage from offscreen document
    (async () => {
      try {
        const result = await chrome.storage.local.get(['transcripts']);
        const transcripts = result.transcripts || [];
        
        transcripts.push(req.data);
        
        // Keep last 500 entries
        if (transcripts.length > 500) {
          transcripts.shift();
        }
        
        await chrome.storage.local.set({ transcripts });
        console.log('[Background] Saved transcript to storage, total:', transcripts.length);
        sendResponse({ status: 'saved' });
      } catch (err) {
        console.error('[Background] Failed to save transcript:', err);
        sendResponse({ status: 'error', message: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (req?.type === 'MUTE_TAB_VIDEO') {
    // Forward mute request to content script in ALL frames of the tab
    console.log('[Background] Broadcasting MUTE_VIDEO to all frames in tab:', req.tabId);
    
    // Send to all frames (Chrome will broadcast to all content scripts in this tab)
    chrome.tabs.sendMessage(req.tabId, { type: 'MUTE_VIDEO' }, { frameId: undefined })
      .then(() => {
        console.log('[Background] Mute message broadcast successfully');
        
        // Also retry after delays to catch late-loading iframes
        setTimeout(() => {
          chrome.tabs.sendMessage(req.tabId, { type: 'MUTE_VIDEO' }).catch(() => {});
        }, 1000);
        
        setTimeout(() => {
          chrome.tabs.sendMessage(req.tabId, { type: 'MUTE_VIDEO' }).catch(() => {});
        }, 3000);
        
        sendResponse({ status: 'ok' });
      })
      .catch(err => {
        console.error('[Background] Failed to send mute message:', err);
        sendResponse({ status: 'error', message: err.message });
      });
    return true;
  }

  if (req?.type === 'UNMUTE_TAB_VIDEO') {
    // Forward unmute request to content script in ALL frames of the tab
    console.log('[Background] Broadcasting UNMUTE_VIDEO to all frames in tab:', req.tabId);
    chrome.tabs.sendMessage(req.tabId, { type: 'UNMUTE_VIDEO' }, { frameId: undefined })
      .then(() => {
        console.log('[Background] Unmute message broadcast successfully');
        sendResponse({ status: 'ok' });
      })
      .catch(err => {
        console.error('[Background] Failed to send unmute message:', err);
        sendResponse({ status: 'error', message: err.message });
      });
    return true;
  }

  if (req.action === "GET_STATUS") {
    sendResponse(sessionState);
    return false;
  } else if (req.action === "START_SESSION") {
    // Handle async operation properly
    (async () => {
      try {
        sessionState.isTranslating = true;
        sessionState.targetLang = req.targetLang;
        
        await setupOffscreenDocument("offscreen.html");
        console.log("[Background] Waiting for offscreen to be ready...");
        
        await waitForOffscreenReady();
        console.log("[Background] Offscreen is ready, starting capture...");
        
        await startCapture(req.targetLang);
        sendResponse({ status: "started" });
      } catch (error) {
        console.error("[Background] Failed to start session:", error);
        sessionState.isTranslating = false;
        sendResponse({ status: "error", message: error.message });
      }
    })();
    return true; // Keep channel open for async response
  } else if (req.action === "STOP_SESSION") {
    (async () => {
      sessionState.isTranslating = false;
      await stopCapture();
      sendResponse({ status: "stopped" });
    })();
    return true; // Keep channel open for async response
  }
  return false;
});

async function setupOffscreenDocument(path) {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) {
    console.log("[Background] Offscreen document already exists");
    isOffscreenCreated = true;
    // If the document exists but we haven't received a ready signal yet, wait for it
    return;
  }

  // Create offscreen document
  try {
    isOffscreenReady = false;
    await chrome.offscreen.createDocument({
      url: path,
      reasons: ['USER_MEDIA'],
      justification: 'Recording tab audio for translation'
    });
    
    isOffscreenCreated = true;
    console.log("[Background] Offscreen document created successfully");
  } catch (error) {
    console.error("[Background] Failed to create offscreen document:", error);
    throw error;
  }
}

async function startCapture(targetLang) {
  try {
    // Get the stream ID for the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error("[Background] No active tab found");
      return;
    }

    console.log("[Background] Capturing audio from tab:", tab.id, "URL:", tab.url);
    capturedTabId = tab.id; // Store tab ID for later unmuting
    
    const streamId = await new Promise((resolve, reject) => {
      // targetTabId: The tab we want to capture
      // consumerTabId: Omitted so it defaults to this extension (allowing offscreen doc to consume)
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(streamId);
        }
      });
    });

    console.log("[Background] Got stream ID:", streamId);

    // Send stream ID, tab ID, and page URL to offscreen document
    await sendMessageToOffscreen({
      type: 'START_CAPTURE',
      data: { streamId, targetLang, tabId: tab.id, pageUrl: tab.url }
    });

  } catch (error) {
    console.error("[Background] Error getting stream ID:", error);
    // Clean up on error
    sessionState.isTranslating = false;
    if (isOffscreenCreated) {
      await chrome.offscreen.closeDocument().catch(() => {});
      isOffscreenCreated = false;
      isOffscreenReady = false;
    }
  }
}

async function stopCapture() {
  // Notify offscreen to stop
  await sendMessageToOffscreen({ type: 'STOP_CAPTURE' }).catch((error) => {
    console.log("[Background] Failed to send stop message (offscreen may be closed):", error);
  });
  
  // Unmute the video in the captured tab
  if (capturedTabId) {
    console.log("[Background] Unmuting video in tab:", capturedTabId);
    chrome.tabs.sendMessage(capturedTabId, { type: 'UNMUTE_VIDEO' })
      .then(() => console.log("[Background] Unmute command sent"))
      .catch(err => console.warn("[Background] Failed to unmute tab:", err));
    capturedTabId = null;
  }
  
  // Close offscreen document
  if (isOffscreenCreated) {
    try {
      await chrome.offscreen.closeDocument();
      isOffscreenCreated = false;
      isOffscreenReady = false;
      console.log("[Background] Offscreen document closed");
    } catch (error) {
      console.error("[Background] Failed to close offscreen document:", error);
      // Reset flag anyway to allow recreation
      isOffscreenCreated = false;
      isOffscreenReady = false;
    }
  }
}

// Transcripts are only cleared when user explicitly stops translation
// This matches the behavior of the Deepgram reference extension
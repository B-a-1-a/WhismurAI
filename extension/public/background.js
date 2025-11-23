// Background Service Worker for WhismurAI Extension

let isOffscreenCreated = false;

// Listen for messages from React UI and offscreen document
chrome.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
  if (req.action === "START_SESSION") {
    await setupOffscreenDocument("offscreen.html");
    startCapture(req.targetLang);
    sendResponse({ status: "started" });
  } else if (req.action === "STOP_SESSION") {
    stopCapture();
    sendResponse({ status: "stopped" });
  } else if (req.type === "TRANSCRIPT_MESSAGE") {
    // Forward transcript messages from offscreen to popup
    // The popup will listen for these messages
    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_UPDATE",
      data: req.data
    }).catch(() => {
      // Popup might not be open, ignore error
    });
  }
  return true;
});

async function setupOffscreenDocument(path) {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Create offscreen document
  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['USER_MEDIA'],
    justification: 'Recording tab audio for translation'
  });
  
  isOffscreenCreated = true;
}

async function startCapture(targetLang) {
  try {
    // Get the stream ID for the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
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

    // Send stream ID to offscreen document
    chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      data: { streamId, targetLang }
    });

  } catch (error) {
    console.error("[Background] Error getting stream ID:", error);
  }
}

async function stopCapture() {
  // Notify offscreen to stop
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
  
  // Close offscreen document
  if (isOffscreenCreated) {
    await chrome.offscreen.closeDocument();
    isOffscreenCreated = false;
  }
}

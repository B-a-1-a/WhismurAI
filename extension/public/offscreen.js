// Offscreen document for audio capture and processing

let socket = null;
let audioContext = null;
let workletNode = null;
let playbackContext = null;
let activeStream = null;
let nextStartTime = 0; // Track when the next chunk should play
let isPlayingAudio = false; // Track if TTS audio is currently playing
let activeTabId = null; // Track the current tab ID for sending messages

// Transcript aggregation state
let currentTranscript = { original: '', translation: '' };
let transcriptTimeout = null;
const TRANSCRIPT_DEBOUNCE_MS = 500; // Wait 500ms for translation to arrive (reduced from 1000ms)

notifyBackgroundReady();

function notifyBackgroundReady() {
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[Offscreen] Failed to notify background of readiness:", chrome.runtime.lastError.message);
    } else {
      console.log("[Offscreen] Ready signal acknowledged:", response);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[Offscreen] Received message:", msg.type);
  
  if (msg.type === 'START_CAPTURE') {
    startCapture(msg.data)
      .then(() => {
        console.log("[Offscreen] START_CAPTURE completed successfully");
        sendResponse({ status: 'ok' });
      })
      .catch((error) => {
        console.error("[Offscreen] START_CAPTURE failed:", error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
    sendResponse({ status: 'ok' });
  }
  return false;
});

async function startCapture(data) {
  try {
    const { streamId, targetLang, tabId } = data;
    console.log("[Offscreen] Starting capture with streamId:", streamId, "tabId:", tabId);
    
    // Store the tab ID for sending mute/unmute messages
    activeTabId = tabId;

    // Get the media stream using the ID from background
    console.log("[Offscreen] Requesting getUserMedia with tab capture...");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    console.log("[Offscreen] Got media stream:", stream);
    activeStream = stream;
    
    // Connect to WebSocket
    console.log("[Offscreen] Connecting to WebSocket...");
    await connectSocket(stream, targetLang);
    console.log("[Offscreen] WebSocket connection established");

  } catch (err) {
    console.error("[Offscreen] Capture error:", err);
    console.error("[Offscreen] Error stack:", err.stack);
    throw err; // Re-throw so the message handler can catch it
  }
}

function stopCapture() {
  console.log("[Offscreen] Stopping capture");
  
  // Clear any pending transcript timeout
  if (transcriptTimeout) {
    clearTimeout(transcriptTimeout);
    transcriptTimeout = null;
  }
  
  // Reset transcript accumulation
  currentTranscript = { original: '', translation: '' };
  
  if (socket) {
    socket.close();
    socket = null;
  }
  
  if (workletNode) {
    workletNode.disconnect();
    workletNode.port.close();
    workletNode = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }

  if (playbackContext) {
    playbackContext.close();
    playbackContext = null;
  }
  
  // Reset scheduler
  nextStartTime = 0;
}

async function connectSocket(stream, targetLang) {
  const url = `ws://localhost:8000/ws/translate/${targetLang}`;
  console.log("[Offscreen] Connecting to:", url);
  
  socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  
  socket.onopen = async () => {
    console.log("[Offscreen] WebSocket connected");
    await setupAudioProcessing(stream, socket);
  };
  
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'transcript') {
          const isFinal = data.is_final !== undefined ? data.is_final : true; // Default to true for backward compatibility
          console.log(`[Offscreen] Transcript chunk (${data.mode}, final=${isFinal}):`, data.text);
          
          // Only process FINAL transcripts to avoid overlaps and repetition
          if (isFinal) {
            if (data.mode === 'original') {
              currentTranscript.original = data.text;  // Replace with complete sentence
              console.log('[Offscreen] 📝 FINAL original received:', data.text.substring(0, 80));
            } else if (data.mode === 'translation') {
              currentTranscript.translation = data.text;  // Replace with complete translation
              console.log('[Offscreen] 🌐 FINAL translation received:', data.text.substring(0, 80));
            }
            
            // Clear interim display when we get a final chunk
            chrome.runtime.sendMessage({
                type: 'TRANSCRIPT_INTERIM',
                data: null
            }).catch(() => {}); // Ignore errors if popup is closed

            // Immediately save when we get a final pair
            // (or wait briefly for the translation to arrive)
            clearTimeout(transcriptTimeout);
            transcriptTimeout = setTimeout(() => {
              const hasOriginal = currentTranscript.original && currentTranscript.original.trim().length > 0;
              const hasTranslation = currentTranscript.translation && currentTranscript.translation.trim().length > 0;
              
              if (hasOriginal || hasTranslation) {
                const transcriptPair = {
                  original: currentTranscript.original.trim(),
                  translation: currentTranscript.translation.trim(),
                  timestamp: Date.now()
                };
                
                console.log('[Offscreen] ✅ Saving complete transcript pair:', {
                  original: transcriptPair.original.substring(0, 60) + '...',
                  translation: transcriptPair.translation.substring(0, 60) + '...'
                });
                appendTranscript(transcriptPair);
                
                // Broadcast to popup
                chrome.runtime.sendMessage({
                  type: 'TRANSCRIPT_UPDATE',
                  data: transcriptPair
                }).catch(err => console.log('[Offscreen] Failed to broadcast:', err));
                
                // Reset for next transcript
                currentTranscript = { original: '', translation: '' };
              }
            }, 500);  // Shorter timeout (500ms) since we're only waiting for translation
          } else {
            // Show interim results (sentence being built) but don't save them
            console.log(`[Offscreen] 🔨 Building sentence (${data.mode}): ${data.text.substring(0, 50)}...`);
            
            // Broadcast interim to popup
            chrome.runtime.sendMessage({
                type: 'TRANSCRIPT_INTERIM',
                data: {
                    text: data.text,
                    mode: data.mode
                }
            }).catch(() => {}); // Ignore errors if popup is closed
          }
        }
      } catch (e) {
        console.error("[Offscreen] Failed to parse JSON:", e);
      }
    } else {
      // Received audio chunk from TTS - play it
      console.log("[Offscreen] Received audio chunk, size:", event.data.byteLength);
      playPcmChunk(event.data);
    }
  };

  socket.onerror = (err) => console.error("[Offscreen] WS Error:", err);
  socket.onclose = () => console.log("[Offscreen] WebSocket closed");
}

function appendTranscript(transcriptPair) {
  // Offscreen documents don't have access to chrome.storage
  // So we send the transcript to the background script to save it
  chrome.runtime.sendMessage({
    type: 'SAVE_TRANSCRIPT',
    data: transcriptPair
  }).then(() => {
    console.log('[Offscreen] Transcript sent to background for storage');
  }).catch(err => {
    console.error('[Offscreen] Failed to send transcript to background:', err);
  });
}

async function setupAudioProcessing(stream, ws) {
  // Use native sample rate instead of forcing 16kHz (which can fail)
  // The browser will handle sample rate conversion automatically
  console.log("[Offscreen] Creating AudioContext...");
  audioContext = new AudioContext();
  console.log("[Offscreen] AudioContext sample rate:", audioContext.sampleRate);
  
  try {
    // Load the AudioWorklet module
    const workletUrl = chrome.runtime.getURL('pcm-processor.js');
    console.log("[Offscreen] Loading AudioWorklet from:", workletUrl);
    await audioContext.audioWorklet.addModule(workletUrl);
    console.log("[Offscreen] AudioWorklet module loaded");
    
    // Create the worklet node with sample rate info
    console.log("[Offscreen] Creating AudioWorkletNode...");
    workletNode = new AudioWorkletNode(audioContext, 'pcm-processor', {
      processorOptions: {
        sampleRate: audioContext.sampleRate
      }
    });
    console.log("[Offscreen] AudioWorkletNode created");
    
    // Listen for PCM data from the worklet
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'pcm-data' && ws.readyState === WebSocket.OPEN) {
        // Periodic audio level logging (once every ~100 chunks)
        if (Math.random() < 0.01) {
          const int16Array = new Int16Array(event.data.data);
          const maxVal = Math.max(...int16Array.map(v => Math.abs(v))) / 0x7FFF;
          console.log(`[Offscreen] Audio level (peak): ${maxVal.toFixed(4)}`);
        }
        
        ws.send(event.data.data);
      }
    };
    
    // Connect: MediaStreamSource -> WorkletNode -> Destination
    console.log("[Offscreen] Creating MediaStreamSource...");
    const source = audioContext.createMediaStreamSource(stream);
    console.log("[Offscreen] Connecting audio nodes...");
    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
    
    console.log("[Offscreen] Audio processing pipeline established");
    
  } catch (err) {
    console.error("[Offscreen] Failed to setup AudioWorklet:", err);
    console.error("[Offscreen] Error details:", err.message, err.stack);
    throw err;
  }
}

// floatTo16BitPCM function removed - now handled by AudioWorklet processor

function playPcmChunk(data) {
  try {
    if (!playbackContext) {
      // Fish Audio outputs 24kHz
      playbackContext = new AudioContext({ sampleRate: 24000 });
      nextStartTime = playbackContext.currentTime;
    }
    
    if (playbackContext.state === 'suspended') {
      playbackContext.resume();
    }
    
    // Mute video when we start playing TTS audio
    if (!isPlayingAudio) {
      isPlayingAudio = true;
      muteVideo();
    }
    
    if (data instanceof Blob) {
      data.arrayBuffer().then(buffer => processPcmData(buffer));
    } else if (data instanceof ArrayBuffer) {
      processPcmData(data);
    }
  } catch (error) {
    console.error("[Offscreen] Playback error:", error);
  }
}

function processPcmData(buffer) {
  const int16Array = new Int16Array(buffer);
  const float32Array = new Float32Array(int16Array.length);
  
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }
  
  const audioBuffer = playbackContext.createBuffer(1, float32Array.length, playbackContext.sampleRate);
  audioBuffer.getChannelData(0).set(float32Array);
  
  const source = playbackContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(playbackContext.destination);
  
  // Schedule playback to avoid overlap and gaps
  const currentTime = playbackContext.currentTime;
  
  // If nextStartTime is in the past (we fell behind or just started), reset to now
  // Adding a small buffer (0.05s) allows for smoother startup
  if (nextStartTime < currentTime) {
    nextStartTime = currentTime + 0.05;
  }
  
  source.start(nextStartTime);
  
  // Advance the schedule pointer
  nextStartTime += audioBuffer.duration;
  
  // When audio finishes playing, unmute the video
  source.onended = () => {
    // Check if this is the last scheduled chunk
    const timeSinceLastScheduled = playbackContext.currentTime - nextStartTime;
    if (timeSinceLastScheduled >= -0.1) { // Small tolerance
      console.log('[Offscreen] TTS audio finished, unmuting video');
      isPlayingAudio = false;
      unmuteVideo();
    }
  };
}

function muteVideo() {
  if (activeTabId) {
    console.log('[Offscreen] Sending MUTE_VIDEO message to tab:', activeTabId);
    chrome.runtime.sendMessage({
      type: 'MUTE_TAB_VIDEO',
      tabId: activeTabId
    }).catch(err => console.warn('[Offscreen] Failed to send mute request:', err));
  }
}

function unmuteVideo() {
  if (activeTabId) {
    console.log('[Offscreen] Sending UNMUTE_VIDEO message to tab:', activeTabId);
    chrome.runtime.sendMessage({
      type: 'UNMUTE_TAB_VIDEO',
      tabId: activeTabId
    }).catch(err => console.warn('[Offscreen] Failed to send unmute request:', err));
  }
}

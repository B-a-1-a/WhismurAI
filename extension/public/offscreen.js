// Offscreen document for audio capture and processing

let socket = null;
let audioContext = null;
let workletNode = null;
let playbackContext = null;
let activeStream = null;
let nextStartTime = 0; // Track when the next chunk should play
let firstAudioReceived = false; // Track if we've received first audio chunk

// Transcript aggregation state
let currentTranscript = { original: '', translation: '' };
let transcriptTimeout = null;

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
    const { streamId, targetLang } = data;
    console.log("[Offscreen] Starting capture with streamId:", streamId);

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

  // Reset scheduler and flags
  nextStartTime = 0;
  firstAudioReceived = false;
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
          console.log(`[Offscreen] Transcript chunk (${data.mode}):`, data.text);

          // Accumulate streaming chunks
          if (data.mode === 'original') {
            currentTranscript.original += data.text;
          } else if (data.mode === 'translation') {
            currentTranscript.translation += data.text;
          }

          // Debounce: wait for chunks to stop coming before saving
          clearTimeout(transcriptTimeout);
          transcriptTimeout = setTimeout(() => {
            // Save the complete transcript pair
            if (currentTranscript.original || currentTranscript.translation) {
              const transcriptPair = {
                original: currentTranscript.original,
                translation: currentTranscript.translation,
                timestamp: Date.now()
              };

              console.log('[Offscreen] Saving transcript pair:', transcriptPair);
              appendTranscript(transcriptPair);

              // Broadcast to popup
              chrome.runtime.sendMessage({
                type: 'TRANSCRIPT_UPDATE',
                data: transcriptPair
              }).catch(err => console.log('[Offscreen] Failed to broadcast:', err));

              // Reset for next transcript
              currentTranscript = { original: '', translation: '' };
            }
          }, 500); // Wait 500ms after last chunk
        }
      } catch (e) {
        console.error("[Offscreen] Failed to parse JSON:", e);
      }
    } else {
      // Received PCM audio from Fish Audio TTS
      if (!firstAudioReceived) {
        firstAudioReceived = true;
        console.log("[Offscreen] 🎵 First audio chunk received! Voice cloning complete, starting playback...");
      }
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
    
    // Connect: MediaStreamSource -> WorkletNode (NO destination connection)
    // We DON'T connect to audioContext.destination to prevent original audio playback
    // Only the translated audio from Fish Audio TTS will be played
    console.log("[Offscreen] Creating MediaStreamSource...");
    const source = audioContext.createMediaStreamSource(stream);
    console.log("[Offscreen] Connecting audio nodes...");
    source.connect(workletNode);
    // NOTE: Intentionally NOT connecting workletNode to destination
    // This mutes the original audio - only translated audio will play

    console.log("[Offscreen] Audio processing pipeline established (original audio muted)");
    
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
      // Fish Audio outputs 24kHz PCM
      playbackContext = new AudioContext({ sampleRate: 24000 });
      nextStartTime = 0;
      console.log("[Offscreen] Created playback context at 24kHz");
    }

    // Resume context if suspended (autoplay policy)
    if (playbackContext.state === 'suspended') {
      playbackContext.resume().then(() => {
        console.log("[Offscreen] Playback context resumed");
      });
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
  // Convert Int16 PCM to Float32 for Web Audio API
  const int16Array = new Int16Array(buffer);
  const float32Array = new Float32Array(int16Array.length);

  for (let i = 0; i < int16Array.length; i++) {
    // Normalize Int16 to Float32 range [-1.0, 1.0]
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }

  // Create audio buffer at 24kHz (Fish Audio output rate)
  const audioBuffer = playbackContext.createBuffer(
    1,  // mono channel
    float32Array.length,
    24000  // Fish Audio sample rate
  );
  audioBuffer.getChannelData(0).set(float32Array);

  // Create source and connect to destination
  const source = playbackContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(playbackContext.destination);

  // Schedule playback to avoid gaps and overlaps
  const currentTime = playbackContext.currentTime;

  // Initialize or reset scheduler if we fell behind
  if (nextStartTime < currentTime) {
    nextStartTime = currentTime + 0.05;  // 50ms buffer for smooth startup
  }

  source.start(nextStartTime);

  // Advance scheduler by the duration of this chunk
  const duration = audioBuffer.duration;
  nextStartTime += duration;

  console.log(`[Offscreen] Playing audio: ${(duration * 1000).toFixed(0)}ms, scheduled at ${nextStartTime.toFixed(2)}s`);
}


// Background Service Worker for WhismurAI Extension
// Handles audio capture, WebSocket communication, and audio playback

let activeStream = null;
let socket = null;
let audioContext = null;
let processor = null;
let playbackContext = null;

// Listen for messages from the React UI
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "START_SESSION") {
    startCapture(req.targetLang);
    sendResponse({ status: "started" });
  } else if (req.action === "STOP_SESSION") {
    stopCapture();
    sendResponse({ status: "stopped" });
  }
  return true;
});

/**
 * Start capturing audio from the active tab
 */
async function startCapture(targetLang) {
  try {
    console.log("[Background] Starting capture for language:", targetLang);
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Request tab capture
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture(
        {
          audio: true,
          video: false
        },
        (stream) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (stream) {
            resolve(stream);
          } else {
            reject(new Error("Failed to capture stream"));
          }
        }
      );
    });

    activeStream = streamId;
    
    // Connect to the backend WebSocket
    connectSocket(streamId, targetLang);
    
  } catch (error) {
    console.error("[Background] Error starting capture:", error);
  }
}

/**
 * Stop capturing audio and close connections
 */
function stopCapture() {
  console.log("[Background] Stopping capture");
  
  // Close WebSocket
  if (socket) {
    socket.close();
    socket = null;
  }
  
  // Stop audio processing
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // Stop media stream
  if (activeStream) {
    if (activeStream.getTracks) {
      activeStream.getTracks().forEach(track => track.stop());
    }
    activeStream = null;
  }
  
  // Close playback context
  if (playbackContext) {
    playbackContext.close();
    playbackContext = null;
  }
}

/**
 * Connect to the backend WebSocket and set up audio processing
 */
function connectSocket(stream, targetLang) {
  const url = `ws://localhost:8000/ws/translate/${targetLang}`;
  
  console.log("[Background] Connecting to WebSocket:", url);
  
  socket = new WebSocket(url);
  
  socket.onopen = () => {
    console.log("[Background] WebSocket connected");
    setupAudioProcessing(stream, socket);
  };
  
  socket.onmessage = (event) => {
    // Receive translated audio from backend
    playPcmChunk(event.data);
  };
  
  socket.onerror = (error) => {
    console.error("[Background] WebSocket error:", error);
  };
  
  socket.onclose = () => {
    console.log("[Background] WebSocket closed");
  };
}

/**
 * Set up audio processing pipeline
 * Captures audio from the stream, converts to PCM, and sends to WebSocket
 */
function setupAudioProcessing(stream, ws) {
  // Create audio context with 16kHz sample rate (required by backend)
  audioContext = new AudioContext({ sampleRate: 16000 });
  
  const source = audioContext.createMediaStreamSource(stream);
  
  // Create a script processor for audio data
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  source.connect(processor);
  processor.connect(audioContext.destination);
  
  processor.onaudioprocess = (e) => {
    if (ws.readyState === WebSocket.OPEN) {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = floatTo16BitPCM(inputData);
      ws.send(pcmData);
    }
  };
  
  console.log("[Background] Audio processing setup complete");
}

/**
 * Convert Float32Array audio data to 16-bit PCM
 */
function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

/**
 * Play received PCM audio chunks
 * This receives the translated audio from the backend
 */
function playPcmChunk(data) {
  try {
    // Initialize playback context if needed (24kHz for Fish Audio output)
    if (!playbackContext) {
      playbackContext = new AudioContext({ sampleRate: 24000 });
    }
    
    // Convert the received data to audio buffer and play
    // Note: This is a simplified version. In production, you'd want to
    // implement proper buffering and queue management for smooth playback
    
    if (data instanceof ArrayBuffer) {
      const int16Array = new Int16Array(data);
      const float32Array = new Float32Array(int16Array.length);
      
      // Convert 16-bit PCM to Float32
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
      }
      
      // Create audio buffer
      const audioBuffer = playbackContext.createBuffer(
        1,
        float32Array.length,
        playbackContext.sampleRate
      );
      
      audioBuffer.getChannelData(0).set(float32Array);
      
      // Play the buffer
      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);
      source.start();
    }
  } catch (error) {
    console.error("[Background] Error playing audio:", error);
  }
}

console.log("[Background] WhismurAI service worker loaded");


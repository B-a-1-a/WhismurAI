// Offscreen document for audio capture and processing

let socket = null;
let audioContext = null;
let workletNode = null;
let playbackContext = null;
let activeStream = null;
let nextStartTime = 0; // Track when the next chunk should play
let isPlayingAudio = false; // Track if TTS audio is currently playing
let activeTabId = null; // Track the current tab ID for sending messages

// Voice cloning state
let voiceCloneBuffer = []; // Buffer to store audio chunks for voice cloning
let voiceCloneStartTime = null; // When voice cloning started
let voiceCloneDuration = 10000; // Capture 10 seconds for voice cloning
let isVoiceCloning = false; // Whether we're currently capturing for voice cloning
let voiceCloneComplete = false; // Whether voice cloning has been completed
let currentPageUrl = null; // Current page URL for voice model storage

// Translation service (frontend translation & TTS)
let translationPipeline = null;
let targetLanguage = 'es';

// Transcript aggregation state
let currentTranscript = { original: '', translation: '' };
let transcriptTimeout = null;
const TRANSCRIPT_DEBOUNCE_MS = 500; // Wait 500ms for translation to arrive (reduced from 1000ms)

// Listen for Fish Audio playback events
window.addEventListener('fish-audio-ready', (event) => {
  const { audioData } = event.detail;
  if (audioData) {
    console.log('[Offscreen] Playing Fish Audio TTS');
    playPcmChunk(audioData);
  }
});

// Initialize translation service
function initTranslationService() {
  try {
    // Wait for DOM to be ready
    if (typeof TranslationPipeline !== 'undefined') {
      translationPipeline = new TranslationPipeline(targetLanguage);
      console.log('[Offscreen] Translation pipeline initialized for:', targetLanguage);
      
      // Listen for translation events
      window.addEventListener('translation', (event) => {
        const { text, isFinal, language } = event.detail;
        console.log('[Offscreen] Translation received:', text.substring(0, 50));
        
        if (isFinal) {
          currentTranscript.translation = text;
          
          // Save transcript pair
          if (currentTranscript.original) {
            saveTranscriptPair();
          }
        } else {
          // Show interim translation
          chrome.runtime.sendMessage({
            type: 'TRANSCRIPT_INTERIM',
            data: {
              text: text,
              mode: 'translation'
            }
          }).catch(() => {});
        }
      });
    } else {
      // Try again after a short delay if TranslationPipeline not loaded yet
      setTimeout(initTranslationService, 100);
    }
  } catch (error) {
    console.error('[Offscreen] Failed to initialize translation service:', error);
  }
}

// Save transcript pair to storage and broadcast
function saveTranscriptPair() {
  clearTimeout(transcriptTimeout);
  
  const hasOriginal = currentTranscript.original && currentTranscript.original.trim().length > 0;
  const hasTranslation = currentTranscript.translation && currentTranscript.translation.trim().length > 0;
  
  if (hasOriginal || hasTranslation) {
    const transcriptPair = {
      original: currentTranscript.original.trim(),
      translation: currentTranscript.translation.trim(),
      timestamp: Date.now()
    };
    
    console.log('[Offscreen] ✅ Saving transcript pair:', {
      original: transcriptPair.original.substring(0, 60) + '...',
      translation: transcriptPair.translation.substring(0, 60) + '...'
    });
    
    appendTranscript(transcriptPair);
    
    // Broadcast to popup
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPT_UPDATE',
      data: transcriptPair
    }).catch(err => console.log('[Offscreen] Failed to broadcast:', err));
    
    // Clear interim display
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPT_INTERIM',
      data: null
    }).catch(() => {});
    
    // Reset for next transcript
    currentTranscript = { original: '', translation: '' };
  }
}

// Initialize on load
initTranslationService();

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
  } else if (msg.type === 'SET_USE_CLONED_VOICE') {
    // Update the TTS service to use cloned voice
    if (translationPipeline && translationPipeline.tts) {
      const { useClonedVoice, modelId, fishApiKey } = msg;
      
      if (useClonedVoice && modelId) {
        // Initialize Fish Audio with API key if provided
        if (fishApiKey && translationPipeline.tts.fishTTS) {
          translationPipeline.tts.fishTTS.initialize(fishApiKey).then(() => {
            console.log('[Offscreen] Fish Audio TTS initialized with provided API key');
            translationPipeline.tts.setCustomVoiceModel(modelId);
            translationPipeline.tts.setUseFishAudio(true);
            console.log('[Offscreen] Enabled cloned voice:', modelId);
          }).catch(err => {
            console.error('[Offscreen] Failed to initialize Fish Audio:', err);
          });
        } else {
          translationPipeline.tts.setCustomVoiceModel(modelId);
          translationPipeline.tts.setUseFishAudio(true);
          console.log('[Offscreen] Enabled cloned voice:', modelId);
        }
      } else {
        translationPipeline.tts.setUseFishAudio(false);
        console.log('[Offscreen] Disabled cloned voice, using default');
      }
      
      sendResponse({ status: 'ok' });
    } else {
      sendResponse({ status: 'error', message: 'TTS service not available' });
    }
  } else if (msg.type === 'UPDATE_FISH_API_KEY') {
    // Update Fish Audio API key
    if (translationPipeline && translationPipeline.tts && translationPipeline.tts.fishTTS) {
      const { fishApiKey } = msg;
      translationPipeline.tts.fishTTS.initialize(fishApiKey).then(() => {
        console.log('[Offscreen] Fish Audio TTS API key updated');
        sendResponse({ status: 'ok' });
      }).catch(err => {
        console.error('[Offscreen] Failed to update API key:', err);
        sendResponse({ status: 'error', message: err.message });
      });
    } else {
      sendResponse({ status: 'error', message: 'Fish TTS not available' });
    }
    return true; // Keep channel open for async response
  }
  return false;
});

async function startCapture(data) {
  try {
    const { streamId, targetLang, tabId, pageUrl } = data;
    console.log("[Offscreen] Starting capture with streamId:", streamId, "tabId:", tabId, "pageUrl:", pageUrl);
    
    // Store the tab ID and URL for sending mute/unmute messages and voice cloning
    activeTabId = tabId;
    currentPageUrl = pageUrl;
    
    // Reset voice cloning state
    voiceCloneBuffer = [];
    voiceCloneStartTime = null;
    isVoiceCloning = false;
    voiceCloneComplete = false;

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
  
  // Reset voice cloning state
  voiceCloneBuffer = [];
  voiceCloneStartTime = null;
  isVoiceCloning = false;
  currentPageUrl = null;
  
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
  
  socket.onmessage = async (event) => {
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data);
        
        // Handle configuration message
        if (data.type === 'config') {
          targetLanguage = data.target_language;
          console.log('[Offscreen] Config received - target language:', targetLanguage);
          
          if (translationPipeline) {
            translationPipeline.setTargetLanguage(targetLanguage);
          }
          return;
        }
        
        // Handle transcript from backend (STT only)
        if (data.type === 'transcript') {
          const isFinal = data.is_final !== undefined ? data.is_final : true;
          const text = data.text;
          
          console.log(`[Offscreen] Transcript (final=${isFinal}):`, text.substring(0, 80));
          
          // Store original transcript
          if (isFinal) {
            currentTranscript.original = text;
            console.log('[Offscreen] 📝 FINAL original received:', text.substring(0, 80));
            
            // Translate using frontend service
            if (translationPipeline && text.trim()) {
              try {
                await translationPipeline.processTranscript(text, true);
              } catch (error) {
                console.error('[Offscreen] Translation failed:', error);
                // Save without translation if it fails
                saveTranscriptPair();
              }
            } else {
              // No translation service, just save original
              saveTranscriptPair();
            }
          } else {
            // Show interim transcript
            console.log(`[Offscreen] 🔨 Building: ${text.substring(0, 50)}...`);
            
            // Broadcast interim to popup
            chrome.runtime.sendMessage({
                type: 'TRANSCRIPT_INTERIM',
                data: {
                text: text,
                mode: 'original'
                }
            }).catch(() => {});
            
            // Optionally translate interim (debounced)
            if (translationPipeline && text.trim()) {
              translationPipeline.processTranscript(text, false).catch(console.error);
            }
          }
        }
      } catch (e) {
        console.error("[Offscreen] Failed to parse JSON:", e);
      }
    } else {
      // Backend no longer sends audio (we use frontend TTS)
      console.warn("[Offscreen] Received unexpected binary data");
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
        
        // Send to WebSocket for STT
        ws.send(event.data.data);
        
        // Also buffer for voice cloning if active
        if (isVoiceCloning && !voiceCloneComplete) {
          bufferAudioForCloning(event.data.data);
        }
      }
    };
    
    // Connect: MediaStreamSource -> WorkletNode -> Destination
    console.log("[Offscreen] Creating MediaStreamSource...");
    const source = audioContext.createMediaStreamSource(stream);
    console.log("[Offscreen] Connecting audio nodes...");
    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
    
    console.log("[Offscreen] Audio processing pipeline established");
    
    // Start voice cloning capture
    startVoiceCloning();
    
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
    
    // Mute video when we start playing TTS audio (if not already muted)
    if (!isPlayingAudio) {
      console.log('[Offscreen] 🎵 First TTS audio chunk, ensuring video is muted...');
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
  
  // Convert PCM to float
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }
  
  // Create STEREO buffer (2 channels) so audio plays in both speakers
  const audioBuffer = playbackContext.createBuffer(2, float32Array.length, playbackContext.sampleRate);
  
  // Copy the mono audio to both left (0) and right (1) channels
  audioBuffer.getChannelData(0).set(float32Array); // Left channel
  audioBuffer.getChannelData(1).set(float32Array); // Right channel
  
  const source = playbackContext.createBufferSource();
  source.buffer = audioBuffer;
  
  // Speed up playback by 1.25x for better responsiveness
  source.playbackRate.value = 1.25;
  
  source.connect(playbackContext.destination);
  
  // Schedule playback to avoid overlap and gaps
  const currentTime = playbackContext.currentTime;
  
  // If nextStartTime is in the past (we fell behind or just started), reset to now
  // Adding a small buffer (0.05s) allows for smoother startup
  if (nextStartTime < currentTime) {
    nextStartTime = currentTime + 0.05;
  }
  
  source.start(nextStartTime);
  
  // Advance the schedule pointer (adjusted for playback rate)
  // At 1.25x speed, audio takes less time to play
  nextStartTime += audioBuffer.duration / 1.25;
  
  // When audio finishes playing, unmute the video
  source.onended = () => {
    // Check if this is the last scheduled chunk
    const timeSinceLastScheduled = playbackContext.currentTime - nextStartTime;
    console.log('[Offscreen] Audio chunk ended, timeSinceLastScheduled:', timeSinceLastScheduled);
    if (timeSinceLastScheduled >= -0.1) { // Small tolerance
      console.log('[Offscreen] 🎵 Last TTS audio chunk finished');
      isPlayingAudio = false;
      // REMOVED: unmuteVideo(); -> We now keep video muted until session ends
    } else {
      console.log('[Offscreen] More audio chunks pending');
    }
  };
}

function muteVideo() {
  console.log('[Offscreen] 🔇 muteVideo() called, activeTabId:', activeTabId);
  if (activeTabId) {
    console.log('[Offscreen] Sending MUTE_TAB_VIDEO message to background for tab:', activeTabId);
    chrome.runtime.sendMessage({
      type: 'MUTE_TAB_VIDEO',
      tabId: activeTabId
    }).then(response => {
      console.log('[Offscreen] ✅ Mute message acknowledged:', response);
    }).catch(err => {
      console.error('[Offscreen] ❌ Failed to send mute request:', err);
    });
  } else {
    console.error('[Offscreen] ❌ Cannot mute: activeTabId is not set!');
  }
}

function unmuteVideo() {
  console.log('[Offscreen] 🔊 unmuteVideo() called, activeTabId:', activeTabId);
  if (activeTabId) {
    console.log('[Offscreen] Sending UNMUTE_TAB_VIDEO message to background for tab:', activeTabId);
    chrome.runtime.sendMessage({
      type: 'UNMUTE_TAB_VIDEO',
      tabId: activeTabId
    }).then(response => {
      console.log('[Offscreen] ✅ Unmute message acknowledged:', response);
    }).catch(err => {
      console.error('[Offscreen] ❌ Failed to send unmute request:', err);
    });
  } else {
    console.error('[Offscreen] ❌ Cannot unmute: activeTabId is not set!');
  }
}

// Voice Cloning Functions

function startVoiceCloning() {
  console.log('[Offscreen] 🎤 Starting voice cloning capture...');
  isVoiceCloning = true;
  voiceCloneStartTime = Date.now();
  voiceCloneBuffer = [];
  
  // Notify UI that voice cloning has started
  chrome.runtime.sendMessage({
    type: 'VOICE_CLONE_STATUS',
    status: 'capturing',
    message: 'Capturing voice for cloning...'
  }).catch(() => {});
  
  // Set timeout to stop buffering after configured duration
  setTimeout(() => {
    if (isVoiceCloning && !voiceCloneComplete) {
      finishVoiceCloning();
    }
  }, voiceCloneDuration);
}

function bufferAudioForCloning(pcmData) {
  // Only buffer if we haven't exceeded the duration
  const elapsed = Date.now() - voiceCloneStartTime;
  if (elapsed < voiceCloneDuration) {
    // Store a copy of the audio data
    voiceCloneBuffer.push(new Uint8Array(pcmData));
  }
}

function finishVoiceCloning() {
  console.log('[Offscreen] 🎤 Voice cloning capture finished');
  isVoiceCloning = false;
  voiceCloneComplete = true;
  
  // Check if we have enough audio
  if (voiceCloneBuffer.length === 0) {
    console.error('[Offscreen] No audio captured for voice cloning');
    chrome.runtime.sendMessage({
      type: 'VOICE_CLONE_STATUS',
      status: 'error',
      message: 'No audio captured for voice cloning'
    }).catch(() => {});
    return;
  }
  
  console.log(`[Offscreen] Captured ${voiceCloneBuffer.length} audio chunks`);
  
  // Notify UI that we're processing
  chrome.runtime.sendMessage({
    type: 'VOICE_CLONE_STATUS',
    status: 'processing',
    message: 'Creating voice model...'
  }).catch(() => {});
  
  // Convert to WAV and send to backend
  createWavAndSendToBackend();
}

function createWavAndSendToBackend() {
  try {
    // Concatenate all audio chunks
    let totalLength = 0;
    voiceCloneBuffer.forEach(chunk => {
      totalLength += chunk.length;
    });
    
    // Create a single buffer with all audio data
    const concatenated = new Uint8Array(totalLength);
    let offset = 0;
    voiceCloneBuffer.forEach(chunk => {
      concatenated.set(chunk, offset);
      offset += chunk.length;
    });
    
    // Convert to Int16Array (PCM data is already in int16 format from worklet)
    const pcmData = new Int16Array(concatenated.buffer);
    
    // Create WAV file
    const sampleRate = audioContext ? audioContext.sampleRate : 16000;
    const wavData = createWavFile(pcmData, sampleRate);
    
    console.log(`[Offscreen] Created WAV file: ${wavData.byteLength} bytes, ${sampleRate}Hz`);
    
    // Send to backend
    sendVoiceCloneToBackend(wavData);
    
  } catch (error) {
    console.error('[Offscreen] Error creating WAV file:', error);
    chrome.runtime.sendMessage({
      type: 'VOICE_CLONE_STATUS',
      status: 'error',
      message: 'Failed to process audio: ' + error.message
    }).catch(() => {});
  }
}

function createWavFile(pcmData, sampleRate) {
  // WAV file format:
  // - RIFF header
  // - fmt chunk
  // - data chunk
  
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmData.length * 2; // 2 bytes per sample (16-bit)
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write PCM data
  const dataView = new Int16Array(buffer, 44);
  dataView.set(pcmData);
  
  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

async function sendVoiceCloneToBackend(wavData) {
  try {
    console.log('[Offscreen] Sending voice clone to backend...');
    
    // Update status to processing
    chrome.runtime.sendMessage({
      type: 'VOICE_CLONE_STATUS',
      status: 'processing',
      message: 'Creating voice model...'
    }).catch(() => {});
    
    // Create form data
    const formData = new FormData();
    const blob = new Blob([wavData], { type: 'audio/wav' });
    formData.append('audio', blob, 'voice-clone.wav');
    formData.append('url', currentPageUrl || window.location.href);
    
    // Extract hostname for title
    let hostname = 'Unknown';
    try {
      const url = new URL(currentPageUrl || window.location.href);
      hostname = url.hostname;
    } catch (e) {
      console.warn('[Offscreen] Could not parse URL for hostname');
    }
    formData.append('title', `Cloned Voice - ${hostname}`);
    
    console.log('[Offscreen] Uploading to backend...', {
      url: currentPageUrl,
      hostname,
      audioSize: wavData.byteLength
    });
    
    // Send to backend
    const response = await fetch('http://localhost:8000/api/clone-voice', {
      method: 'POST',
      body: formData
    });
    
    console.log('[Offscreen] Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('[Offscreen] Voice clone response:', result);
    
    if (result.status === 'success' && result.data) {
      console.log('[Offscreen] ✅ Voice model created:', result.data.model_id);
      
      // Notify background to store the model and show notification
      await chrome.runtime.sendMessage({
        type: 'VOICE_CLONE_COMPLETE',
        data: {
          model_id: result.data.model_id,
          url: currentPageUrl,
          title: result.data.title,
          hostname: result.data.hostname
        }
      });
      
      console.log('[Offscreen] ✅ Voice cloning complete and notification sent!');
    } else {
      throw new Error('Backend returned non-success status or missing data');
    }
    
  } catch (error) {
    console.error('[Offscreen] Failed to send voice clone to backend:', error);
    console.error('[Offscreen] Error details:', error.stack);
    
    chrome.runtime.sendMessage({
      type: 'VOICE_CLONE_STATUS',
      status: 'error',
      message: 'Failed to create voice model: ' + error.message
    }).catch(err => {
      console.error('[Offscreen] Failed to send error status:', err);
    });
  }
}
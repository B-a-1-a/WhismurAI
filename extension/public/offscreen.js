// Offscreen document for audio capture and processing

let socket = null;
let audioContext = null;
let processor = null;
let playbackContext = null;
let activeStream = null;
let nextPlayTime = 0;  // Track when next audio should play

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    startCapture(msg.data);
  } else if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(data) {
  try {
    const { streamId, targetLang } = data;
    console.log("[Offscreen] Starting capture with streamId:", streamId);

    // Get the media stream using the ID from background
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    activeStream = stream;
    
    // Connect to WebSocket
    connectSocket(stream, targetLang);

  } catch (err) {
    console.error("[Offscreen] Capture error:", err);
  }
}

function stopCapture() {
  console.log("[Offscreen] Stopping capture");
  
  if (socket) {
    socket.close();
    socket = null;
  }
  
  if (processor) {
    processor.disconnect();
    processor = null;
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

  nextPlayTime = 0;  // Reset play time
}

function connectSocket(stream, targetLang) {
  const url = `ws://localhost:8000/ws/translate/${targetLang}`;
  console.log("[Offscreen] Connecting to:", url);
  
  socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  
  socket.onopen = async () => {
    console.log("[Offscreen] WebSocket connected");
    nextPlayTime = 0;  // Reset timing when connection starts

    // Pre-create and resume playback context to avoid autoplay issues
    if (!playbackContext) {
      playbackContext = new AudioContext({ sampleRate: 24000 });
    }
    if (playbackContext.state === 'suspended') {
      await playbackContext.resume();
      console.log("[Offscreen] Playback AudioContext resumed");
    }

    setupAudioProcessing(stream, socket);
  };
  
  socket.onmessage = (event) => {
    console.log("[Offscreen] Received audio chunk, size:", event.data.byteLength);
    playPcmChunk(event.data);
  };

  socket.onerror = (err) => console.error("[Offscreen] WS Error:", err);
}

function setupAudioProcessing(stream, ws) {
  audioContext = new AudioContext({ sampleRate: 16000 });
  console.log("[Offscreen] AudioContext sample rate:", audioContext.sampleRate);
  
  const source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  source.connect(processor);
  processor.connect(audioContext.destination);
  
  processor.onaudioprocess = (e) => {
    if (ws.readyState === WebSocket.OPEN) {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Simple silence detection logging (once every ~100 chunks to avoid spam)
      if (Math.random() < 0.01) {
         const maxVal = inputData.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
         console.log(`[Offscreen] Audio level (peak): ${maxVal.toFixed(4)}`);
      }

      const pcmData = floatTo16BitPCM(inputData);
      ws.send(pcmData);
    }
  };
}

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

function playPcmChunk(data) {
  try {
    if (!playbackContext) {
      playbackContext = new AudioContext({ sampleRate: 24000 });
    }
    
    if (playbackContext.state === 'suspended') {
      playbackContext.resume();
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

  // Schedule audio to play at the correct time to avoid gaps/overlaps
  const currentTime = playbackContext.currentTime;
  const startTime = Math.max(currentTime, nextPlayTime);

  source.start(startTime);

  // Calculate when this buffer will finish playing
  const duration = audioBuffer.duration;
  nextPlayTime = startTime + duration;

  console.log(`[Offscreen] Playing audio: ${(float32Array.length / 24000 * 1000).toFixed(0)}ms, scheduled at ${startTime.toFixed(2)}s`);
}


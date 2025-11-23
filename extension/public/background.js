let activeStream = null;
let socket = null;
let audioContext = null;
let processor = null;
let nextTime = 0;

// Listen for React UI Messages
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "START_SESSION") {
    startCapture(req.targetLang);
  }
});

async function startCapture(targetLang) {
  try {
    // 1. Capture Tab
    const streamId = await chrome.tabCapture.getMediaStreamId({ consumerTabId: null });
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });

    // 2. Start Translation
    connectSocket(activeStream, targetLang);
  } catch (err) {
    console.error("Error capturing tab:", err);
  }
}

function connectSocket(stream, targetLang) {
  if (socket) socket.close();
  const url = `ws://localhost:8000/ws/translate/${targetLang}`;

  socket = new WebSocket(url);
  setupAudioProcessing(stream, socket);
  
  socket.onopen = () => {
    console.log("Connected to backend");
  };

  socket.onmessage = async (event) => { 
    if (event.data instanceof Blob) {
      const arrayBuffer = await event.data.arrayBuffer();
      playPcmChunk(arrayBuffer);
    } else {
       playPcmChunk(event.data);
    }
  };
  
  socket.onerror = (e) => console.error("WebSocket error:", e);
}

function setupAudioProcessing(stream, ws) {
  // Input context at 16kHz
  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  // Buffer size 4096, 1 input channel, 1 output channel
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  source.connect(processor);
  processor.connect(audioContext.destination); // Needed to keep processor alive
  
  processor.onaudioprocess = (e) => {
    if (ws.readyState === WebSocket.OPEN) {
      // Convert Float32 to Int16
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(inputData);
      ws.send(pcm16);
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

function playPcmChunk(arrayBuffer) {
  if (!audioContext) return;
  
  const int16Data = new Int16Array(arrayBuffer);
  const float32Data = new Float32Array(int16Data.length);
  
  for (let i = 0; i < int16Data.length; i++) {
    float32Data[i] = int16Data[i] / 32768.0;
  }
  
  // Create buffer for 24kHz audio
  const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
  buffer.getChannelData(0).set(float32Data);
  
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  
  // Schedule playback
  if (nextTime < audioContext.currentTime) {
    nextTime = audioContext.currentTime;
  }
  source.start(nextTime);
  nextTime += buffer.duration;
}


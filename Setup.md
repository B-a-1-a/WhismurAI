# Project: Live Browser Translation Extension (React + Fish Audio + Pipecat)

## 1\. Project Overview

We are building a Chrome Extension that captures live audio from a browser tab, translates it in real-time, and plays it back using **Fish Audio** for Text-to-Speech (TTS).

**Core Logic:**

1.  **Immediate Start:** Translation begins instantly using a generic/default Fish Audio voice.
2.  **Background Cloning:** Simultaneously, the extension records the first 15 seconds of original audio.
3.  **Voice Switch:** Once the clone is ready, the React UI prompts the user to switch from the Generic Voice to the Cloned Voice.

## 2\. Tech Stack

  * **Frontend:** React 18, Vite, Tailwind CSS (UI), Chrome Extension Manifest V3.
  * **Backend:** Python 3.10+, FastAPI.
  * **AI Pipeline (Pipecat):** Deepgram (STT), OpenAI (Translation), Fish Audio (TTS).

## 3\. Directory Structure

```text
project-root/
├── backend/                 # Python Server
│   ├── venv/
│   ├── .env
│   ├── server.py            # FastAPI Entrypoint
│   ├── bot.py               # Pipecat Pipeline
│   └── requirements.txt
└── extension/               # React Extension
    ├── src/
    │   ├── App.jsx          # Main UI Logic
    │   ├── main.jsx         # React Entry
    │   └── index.css        # Tailwind/Styles
    ├── public/
    │   ├── manifest.json
    │   └── background.js    # Service Worker (Audio Logic)
    ├── index.html           # HTML Entry Point
    ├── vite.config.js       # Build Config
    └── package.json
```

-----

## 4\. Backend Implementation

### 4.1 Dependencies (`backend/requirements.txt`)

```text
fastapi
uvicorn[standard]
pipecat-ai[fish,deepgram,openai]
python-dotenv
fish-audio-sdk
python-multipart
requests
websockets
```

### 4.2 Environment Variables (`backend/.env`)

```env
FISH_API_KEY=your_fish_key
DEEPGRAM_API_KEY=your_deepgram_key
OPENAI_API_KEY=your_openai_key
```

### 4.3 Pipeline Logic (`backend/bot.py`)

```python
import os
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.services.openai import OpenAILLMService
from pipecat.services.fish import FishTTSService
from pipecat.transports.network.websocket_server import WebSocketServerTransport, WebSocketServerParams
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

async def run_translation_bot(websocket_client, reference_id, target_lang):
    # Input: 16kHz (from Extension), Output: 24kHz (Fish Audio default)
    transport = WebSocketServerTransport(
        params=WebSocketServerParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
            add_wav_header=False
        )
    )

    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))
    
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini"
    )
    
    # Fish TTS: Uses the ID passed (Generic or Cloned)
    tts = FishTTSService(
        api_key=os.getenv("FISH_API_KEY"),
        reference_id=reference_id,
        latency="balanced"
    )

    messages = [
        {
            "role": "system",
            "content": f"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation."
        }
    ]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
    ])

    task = PipelineTask(pipeline)
    await transport.setup(websocket_client)
    await task.run()
```

### 4.4 Server Endpoints (`backend/server.py`)

```python
import os
import uuid
from fastapi import FastAPI, UploadFile, File, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fish_audio_sdk import Session
from bot import run_translation_bot
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

fish_session = Session(os.getenv("FISH_API_KEY"))

# Default Generic Voice ID (Replace with a real ID from Fish Audio console)
DEFAULT_VOICE_ID = "7f92f8afb8ec43bf81429cc1c9199cb1" 

@app.post("/clone-voice")
async def clone_voice(file: UploadFile = File(...)):
    print("Cloning process started...")
    audio_content = await file.read()
    
    # train_mode="fast" is crucial for live UX
    model = fish_session.create_model(
        title=f"Live-Clone-{uuid.uuid4()}",
        voices=[audio_content],
        train_mode="fast"
    )
    
    return {"reference_id": model.id, "status": "ready"}

@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    await websocket.accept()
    ref_id = websocket.query_params.get("reference_id", DEFAULT_VOICE_ID)
    print(f"Starting pipeline. Voice: {ref_id}")
    await run_translation_bot(websocket, ref_id, target_lang)
```

-----

## 5\. Frontend Implementation (React)

### 5.1 Extension Manifest (`extension/public/manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "React Live Translator",
  "version": "1.0",
  "permissions": ["tabCapture", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "action": { "default_popup": "index.html" },
  "background": { "service_worker": "background.js" }
}
```

### 5.2 Background Worker (`extension/public/background.js`)

Handles the heavy audio lifting. Not React, pure JS worker.

```javascript
let activeStream = null;
let socket = null;
let audioContext = null;
let processor = null;

// Listen for React UI Messages
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "START_SESSION") {
    startCapture(req.targetLang);
  } else if (req.action === "SWITCH_VOICE") {
    switchVoice(req.newRefId, req.targetLang);
  }
});

async function startCapture(targetLang) {
  // 1. Capture Tab
  const streamId = await chrome.tabCapture.getMediaStreamId({ consumerTabId: null });
  activeStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false
  });

  // 2. Start Generic Translation
  connectSocket(activeStream, null, targetLang);

  // 3. Start Background Cloning
  recordForClone(activeStream);
}

function recordForClone(stream) {
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.start();
  setTimeout(() => recorder.stop(), 15000);

  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/wav' });
    const formData = new FormData();
    formData.append("file", blob, "sample.wav");

    try {
      const res = await fetch("http://localhost:8000/clone-voice", { method: "POST", body: formData });
      const data = await res.json();
      // Tell React UI that clone is ready
      chrome.runtime.sendMessage({ 
        action: "CLONE_READY", 
        referenceId: data.reference_id 
      });
    } catch (e) { console.error("Cloning failed:", e); }
  };
}

function connectSocket(stream, refId, targetLang) {
  if (socket) socket.close();
  const url = refId 
    ? `ws://localhost:8000/ws/translate/${targetLang}?reference_id=${refId}`
    : `ws://localhost:8000/ws/translate/${targetLang}`;

  socket = new WebSocket(url);
  setupAudioProcessing(stream, socket);
  socket.onmessage = (event) => { playPcmChunk(event.data); };
}

function switchVoice(newId, lang) {
  connectSocket(activeStream, newId, lang);
}

function setupAudioProcessing(stream, ws) {
  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(audioContext.destination); 
  processor.onaudioprocess = (e) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
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

function playPcmChunk(data) { /* PCM Playback Logic */ }
```

### 5.3 Vite Config (`extension/vite.config.js`)

Ensure the build outputs valid extension files.

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
```

### 5.4 React UI (`extension/src/App.jsx`)

```jsx
import React, { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [status, setStatus] = useState('idle'); // idle, translating, switching
  const [cloneId, setCloneId] = useState(null);
  const [targetLang, setTargetLang] = useState('es');

  useEffect(() => {
    // Listen for Clone Ready event from Background
    const handleMessage = (request) => {
      if (request.action === 'CLONE_READY') {
        setCloneId(request.referenceId);
        console.log("Clone ready in UI:", request.referenceId);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleStart = () => {
    setStatus('translating');
    chrome.runtime.sendMessage({
      action: 'START_SESSION',
      targetLang: targetLang
    });
  };

  const handleSwitch = () => {
    setStatus('switching');
    chrome.runtime.sendMessage({
      action: 'SWITCH_VOICE',
      newRefId: cloneId,
      targetLang: targetLang
    });
    setTimeout(() => setStatus('cloned'), 1000);
  };

  return (
    <div className="w-80 p-4 bg-gray-900 text-white h-96 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-cyan-400">Fish Live Translate</h1>
      
      {/* Language Selector */}
      <select 
        value={targetLang} 
        onChange={(e) => setTargetLang(e.target.value)}
        className="bg-gray-800 p-2 rounded border border-gray-700"
      >
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="ja">Japanese</option>
      </select>

      {/* Start Button */}
      {status === 'idle' && (
        <button 
          onClick={handleStart}
          className="bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded font-bold transition"
        >
          Start Listening
        </button>
      )}

      {/* Status Indicators */}
      {status !== 'idle' && (
        <div className="p-3 bg-gray-800 rounded animate-pulse border border-gray-700">
          <p className="text-sm text-gray-400">Status:</p>
          <p className="text-lg text-green-400 font-mono">
            {status === 'translating' && 'Translating (Generic)'}
            {status === 'switching' && 'Switching Models...'}
            {status === 'cloned' && 'Translating (Cloned Voice)'}
          </p>
        </div>
      )}

      {/* Switch Prompt */}
      {status === 'translating' && cloneId && (
        <div className="mt-auto bg-indigo-900/50 p-3 rounded border border-indigo-500/50">
          <p className="text-xs mb-2 text-indigo-200">✨ Voice Clone Ready!</p>
          <button 
            onClick={handleSwitch}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded text-sm font-semibold shadow-lg transition transform active:scale-95"
          >
            Switch to Speaker's Voice
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
```

## 6\. Build & Run Instructions

1.  **Backend:**

    ```bash
    cd backend
    pip install -r requirements.txt
    uvicorn server:app --reload
    ```

2.  **Frontend:**

    ```bash
    cd extension
    npm install
    npm run build
    ```

      * Open Chrome -\> Extensions (`chrome://extensions`).
      * Enable "Developer Mode".
      * Click "Load unpacked" and select the `extension/dist` folder.
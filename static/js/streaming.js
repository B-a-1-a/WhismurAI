// Real-time Streaming Audio Translation
const socket = io();

let currentAudioFile = null;
let currentLanguage = "Spanish";
let isTranslated = false;
let isProcessing = false;

// Audio players
let originalAudio = document.getElementById("original-audio");
let translatedAudio = document.getElementById("translated-audio");
let currentAudio = originalAudio;

// Media Source for streaming
let mediaSource = null;
let sourceBuffer = null;
let audioChunks = [];

// DOM Elements
const audioSelect = document.getElementById("audio-select");
const languageSelect = document.getElementById("language-select");
const toggle = document.getElementById("translation-toggle");
const statusText = document.getElementById("status-text");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const audioViz = document.getElementById("audio-viz");
const originalLabel = document.getElementById("original-label");
const translatedLabel = document.getElementById("translated-label");

// Initialize
socket.on("connect", () => {
  console.log("Connected to server");
  updateStatus("Connected - Ready to translate!");
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  updateStatus("Disconnected - Reconnecting...");
});

// WebSocket event handlers
socket.on("progress", (data) => {
  console.log("Progress:", data.step);
  showProgress(data.message);

  if (data.step === "transcribing") {
    setProgress(33);
  } else if (data.step === "translating") {
    setProgress(66);
  } else if (data.step === "generating") {
    setProgress(90);
  }
});

socket.on("streaming_started", (data) => {
  console.log("Streaming started");
  showProgress("Streaming audio... Playing now!");
  setProgress(100);

  // Initialize audio streaming
  initializeStreaming();
});

socket.on("audio_chunk", (data) => {
  console.log(`Received chunk ${data.chunk_number + 1}/${data.total_chunks}`);

  // Decode base64 chunk
  const binaryString = atob(data.chunk);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Add to queue
  audioChunks.push(bytes);

  // Start playback on first chunk
  if (data.chunk_number === 0) {
    playStreamedAudio();
  }

  if (data.is_final) {
    console.log("All chunks received!");
  }
});

socket.on("streaming_complete", (data) => {
  console.log("Streaming complete!");
  hideProgress();
  updateStatus("✓ Translation complete - Audio playing!");
  showAudioViz();
  isProcessing = false;
});

socket.on("error", (data) => {
  console.error("Error:", data.message);
  updateStatus(`❌ Error: ${data.message}`);
  hideProgress();
  isProcessing = false;

  // Revert toggle
  if (isTranslated) {
    toggle.checked = false;
    isTranslated = false;
    playOriginal();
  }
});

// UI Event Handlers
audioSelect.addEventListener("change", (e) => {
  currentAudioFile = e.target.value;

  if (currentAudioFile) {
    toggle.disabled = false;
    toggle.checked = false;
    isTranslated = false;
    playOriginal();
    updateLabels();
  } else {
    toggle.disabled = true;
    stopAllAudio();
    updateStatus("Select an audio file to begin");
  }
});

languageSelect.addEventListener("change", (e) => {
  currentLanguage = e.target.value;

  // If currently translated, re-translate with new language
  if (isTranslated && currentAudioFile) {
    startRealTimeTranslation();
  }
});

toggle.addEventListener("change", (e) => {
  if (!currentAudioFile) {
    updateStatus("Please select an audio file first");
    e.target.checked = false;
    return;
  }

  isTranslated = e.target.checked;
  updateLabels();

  if (isTranslated) {
    startRealTimeTranslation();
  } else {
    stopAllAudio();
    playOriginal();
    updateStatus("Playing original audio");
    hideAudioViz();
  }
});

// Audio Functions
function playOriginal() {
  if (!currentAudioFile) return;

  stopAllAudio();

  originalAudio.src = `/api/original-audio/${currentAudioFile}`;
  originalAudio.load();
  originalAudio.play();
  currentAudio = originalAudio;

  updateStatus("🎵 Playing original audio");
  hideProgress();
}

function startRealTimeTranslation() {
  if (isProcessing) {
    updateStatus("Already processing...");
    return;
  }

  isProcessing = true;
  stopAllAudio();

  // Reset audio chunks
  audioChunks = [];

  updateStatus("Starting real-time translation...");
  showProgress("Initializing...");
  setProgress(10);

  // Send translation request via WebSocket
  socket.emit("start_translation", {
    filename: currentAudioFile,
    target_language: currentLanguage,
  });
}

function initializeStreaming() {
  // Prepare translated audio for streaming
  translatedAudio.src = "";
  currentAudio = translatedAudio;
}

function playStreamedAudio() {
  if (audioChunks.length === 0) return;

  // Combine all chunks into single blob
  const audioBlob = new Blob(audioChunks, { type: "audio/mpeg" });
  const audioUrl = URL.createObjectURL(audioBlob);

  translatedAudio.src = audioUrl;
  translatedAudio.load();
  translatedAudio.play();

  showAudioViz();

  // Cleanup
  translatedAudio.onended = () => {
    URL.revokeObjectURL(audioUrl);
    hideAudioViz();
    updateStatus("✓ Translation playback complete");
  };
}

function stopAllAudio() {
  originalAudio.pause();
  originalAudio.currentTime = 0;
  translatedAudio.pause();
  translatedAudio.currentTime = 0;
  hideAudioViz();
}

// UI Update Functions
function updateStatus(message) {
  statusText.textContent = message;
  statusText.classList.add("active");
  setTimeout(() => statusText.classList.remove("active"), 2000);
}

function showProgress(message) {
  progressContainer.classList.add("active");
  progressText.textContent = message;
}

function hideProgress() {
  progressContainer.classList.remove("active");
  setProgress(0);
}

function setProgress(percent) {
  progressFill.style.width = `${percent}%`;
}

function showAudioViz() {
  audioViz.classList.add("playing");
}

function hideAudioViz() {
  audioViz.classList.remove("playing");
}

function updateLabels() {
  if (isTranslated) {
    originalLabel.classList.remove("active");
    translatedLabel.classList.add("active");
  } else {
    originalLabel.classList.add("active");
    translatedLabel.classList.remove("active");
  }
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  stopAllAudio();
  socket.disconnect();
});

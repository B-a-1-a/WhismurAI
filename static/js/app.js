// Real-time Audio Translation App
let currentAudioFile = null;
let currentLanguage = "Spanish";
let isTranslated = false;
let translatedAudioUrl = null;

// DOM Elements
const audioSelect = document.getElementById("audio-select");
const languageSelect = document.getElementById("language-select");
const toggle = document.getElementById("translation-toggle");
const audioPlayer = document.getElementById("audio-player");
const audioSource = document.getElementById("audio-source");
const playBtn = document.getElementById("play-btn");
const pauseBtn = document.getElementById("pause-btn");
const stopBtn = document.getElementById("stop-btn");
const statusMessage = document.getElementById("status-message");
const loading = document.getElementById("loading");
const modeText = document.getElementById("mode-text");
const languageText = document.getElementById("language-text");
const originalLabel = document.getElementById("original-label");
const translatedLabel = document.getElementById("translated-label");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  updateLabels();
});

function setupEventListeners() {
  // Audio file selection
  audioSelect.addEventListener("change", handleAudioSelect);

  // Language selection
  languageSelect.addEventListener("change", handleLanguageChange);

  // Toggle switch
  toggle.addEventListener("change", handleToggle);

  // Player controls
  playBtn.addEventListener("click", () => audioPlayer.play());
  pauseBtn.addEventListener("click", () => audioPlayer.pause());
  stopBtn.addEventListener("click", () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  });

  // Audio player events
  audioPlayer.addEventListener("loadeddata", () => {
    playBtn.disabled = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
  });

  audioPlayer.addEventListener("play", () => {
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
  });

  audioPlayer.addEventListener("pause", () => {
    playBtn.disabled = false;
    pauseBtn.disabled = true;
  });
}

function handleAudioSelect(event) {
  currentAudioFile = event.target.value;

  if (!currentAudioFile) {
    audioSource.src = "";
    audioPlayer.load();
    playBtn.disabled = true;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    return;
  }

  // Reset state
  isTranslated = false;
  toggle.checked = false;
  translatedAudioUrl = null;

  // Load original audio
  loadOriginalAudio();
  updateLabels();
}

function handleLanguageChange(event) {
  currentLanguage = event.target.value;

  // Clear cached translation
  translatedAudioUrl = null;

  // If currently showing translated, need to re-translate
  if (isTranslated && currentAudioFile) {
    loadTranslatedAudio();
  }

  updateLabels();
}

async function handleToggle(event) {
  if (!currentAudioFile) {
    showStatus("Please select an audio file first", "error");
    toggle.checked = false;
    return;
  }

  isTranslated = toggle.checked;

  if (isTranslated) {
    await loadTranslatedAudio();
  } else {
    loadOriginalAudio();
  }

  updateLabels();
}

function loadOriginalAudio() {
  const url = `/api/original-audio/${currentAudioFile}`;
  audioSource.src = url;
  audioPlayer.load();

  modeText.textContent = "Original";
  languageText.textContent = "English";
  hideStatus();
}

async function loadTranslatedAudio() {
  // Check if we have cached translation
  if (translatedAudioUrl) {
    audioSource.src = translatedAudioUrl;
    audioPlayer.load();
    modeText.textContent = "Translated";
    languageText.textContent = currentLanguage;
    return;
  }

  // Show loading
  showLoading();
  hideStatus();

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: currentAudioFile,
        target_language: currentLanguage,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Translation failed");
    }

    // Get audio blob
    const audioBlob = await response.blob();
    translatedAudioUrl = URL.createObjectURL(audioBlob);

    // Load translated audio
    audioSource.src = translatedAudioUrl;
    audioPlayer.load();

    modeText.textContent = "Translated";
    languageText.textContent = currentLanguage;

    showStatus("Translation complete! 🎉", "success");
    hideLoading();
  } catch (error) {
    console.error("Translation error:", error);
    showStatus(`Error: ${error.message}`, "error");
    hideLoading();

    // Revert toggle
    toggle.checked = false;
    isTranslated = false;
    loadOriginalAudio();
  }
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

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.classList.remove("hidden");

  // Auto-hide success messages after 5 seconds
  if (type === "success") {
    setTimeout(hideStatus, 5000);
  }
}

function hideStatus() {
  statusMessage.classList.add("hidden");
}

function showLoading() {
  loading.classList.remove("hidden");
  playBtn.disabled = true;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
}

function hideLoading() {
  loading.classList.add("hidden");
}

// Cleanup blob URLs when page unloads
window.addEventListener("beforeunload", () => {
  if (translatedAudioUrl) {
    URL.revokeObjectURL(translatedAudioUrl);
  }
});

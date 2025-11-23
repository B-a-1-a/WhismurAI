// Offscreen document for audio capture and processing

let socket = null;
let audioContext = null;
let processor = null;
let playbackContext = null;
let activeStream = null;
let nextStartTime = 0; // Track when the next chunk should play
let isPlayingAudio = false; // Track if TTS audio is currently playing
let activeTabId = null; // Track the current tab ID for sending messages

// Transcript aggregation state
let currentTranscript = { original: "", translation: "" };
let transcriptTimeout = null;
const TRANSCRIPT_DEBOUNCE_MS = 500; // Wait 500ms for translation to arrive (reduced from 1000ms)

notifyBackgroundReady();

function notifyBackgroundReady() {
  chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[Offscreen] Failed to notify background of readiness:",
        chrome.runtime.lastError.message
      );
    } else {
      console.log("[Offscreen] Ready signal acknowledged:", response);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_CAPTURE") {
    startCapture(msg.data);
  } else if (msg.type === "STOP_CAPTURE") {
    stopCapture();
  }
});

async function startCapture(data) {
  try {
    const { streamId, targetLang, tabId } = data;
    console.log(
      "[Offscreen] Starting capture with streamId:",
      streamId,
      "tabId:",
      tabId
    );

    // Store the tab ID for sending mute/unmute messages
    activeTabId = tabId;

    // Get the media stream using the ID from background
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
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
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }

  if (playbackContext) {
    playbackContext.close();
    playbackContext = null;
  }
}

function connectSocket(stream, targetLang) {
  const url = `ws://localhost:8000/ws/translate/${targetLang}`;
  console.log("[Offscreen] Connecting to:", url);

  socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    console.log("[Offscreen] WebSocket connected");
    setupAudioProcessing(stream, socket);
  };

  socket.onmessage = (event) => {
    // Handle both binary audio and JSON transcript messages
    if (event.data instanceof ArrayBuffer) {
      // Binary audio data
      console.log(
        "[Offscreen] Received audio chunk, size:",
        event.data.byteLength
      );
      playPcmChunk(event.data);
    } else if (typeof event.data === "string") {
      // JSON transcript message
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript") {
          const isFinal = data.is_final !== undefined ? data.is_final : true; // Default to true for backward compatibility
          console.log(
            `[Offscreen] Transcript chunk (${data.mode}, final=${isFinal}):`,
            data.text
          );

          // Only process FINAL transcripts to avoid overlaps and repetition
          if (isFinal) {
            if (data.mode === "original") {
              currentTranscript.original = data.text; // Replace with complete sentence
              console.log(
                "[Offscreen] 📝 FINAL original received:",
                data.text.substring(0, 80)
              );
            } else if (data.mode === "translation") {
              currentTranscript.translation = data.text; // Replace with complete translation
              console.log(
                "[Offscreen] 🌐 FINAL translation received:",
                data.text.substring(0, 80)
              );
            }

            // Clear interim display when we get a final chunk
            chrome.runtime
              .sendMessage({
                type: "TRANSCRIPT_INTERIM",
                data: null,
              })
              .catch(() => {}); // Ignore errors if popup is closed

            // Immediately save when we get a final pair
            // (or wait briefly for the translation to arrive)
            clearTimeout(transcriptTimeout);
            transcriptTimeout = setTimeout(() => {
              const hasOriginal =
                currentTranscript.original &&
                currentTranscript.original.trim().length > 0;
              const hasTranslation =
                currentTranscript.translation &&
                currentTranscript.translation.trim().length > 0;

              if (hasOriginal || hasTranslation) {
                const transcriptPair = {
                  original: currentTranscript.original.trim(),
                  translation: currentTranscript.translation.trim(),
                  timestamp: Date.now(),
                };

                console.log("[Offscreen] ✅ Saving complete transcript pair:", {
                  original: transcriptPair.original.substring(0, 60) + "...",
                  translation:
                    transcriptPair.translation.substring(0, 60) + "...",
                });

                // Save transcript to storage via background
                chrome.runtime
                  .sendMessage({
                    type: "SAVE_TRANSCRIPT",
                    data: transcriptPair,
                  })
                  .catch((err) =>
                    console.log("[Offscreen] Failed to save transcript:", err)
                  );

                // Broadcast to popup
                chrome.runtime
                  .sendMessage({
                    type: "TRANSCRIPT_UPDATE",
                    data: transcriptPair,
                  })
                  .catch((err) =>
                    console.log("[Offscreen] Failed to broadcast:", err)
                  );

                // Also forward as TRANSCRIPT_MESSAGE for backward compatibility
                chrome.runtime
                  .sendMessage({
                    type: "TRANSCRIPT_MESSAGE",
                    data: {
                      type: "transcript",
                      mode: "original",
                      text: transcriptPair.original,
                    },
                  })
                  .catch(() => {});

                // Reset for next transcript
                currentTranscript = { original: "", translation: "" };
              }
            }, 500); // Shorter timeout (500ms) since we're only waiting for translation
          } else {
            // Show interim results (sentence being built) but don't save them
            console.log(
              `[Offscreen] 🔨 Building sentence (${
                data.mode
              }): ${data.text.substring(0, 50)}...`
            );

            // Broadcast interim to popup
            chrome.runtime
              .sendMessage({
                type: "TRANSCRIPT_INTERIM",
                data: {
                  text: data.text,
                  mode: data.mode,
                },
              })
              .catch(() => {}); // Ignore errors if popup is closed
          }
        }
      } catch (e) {
        console.error("[Offscreen] Failed to parse transcript message:", e);
      }
    } else {
      // Received audio chunk from TTS - play it
      console.log(
        "[Offscreen] Received audio chunk, size:",
        event.data.byteLength
      );
      playPcmChunk(event.data);
    }
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
        const maxVal = inputData.reduce(
          (max, v) => Math.max(max, Math.abs(v)),
          0
        );
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
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

function playPcmChunk(data) {
  try {
    if (!playbackContext) {
      playbackContext = new AudioContext({ sampleRate: 24000 });
    }

    if (playbackContext.state === "suspended") {
      playbackContext.resume();
    }

    // Track that we're playing TTS audio (but don't mute original audio)
    if (!isPlayingAudio) {
      console.log(
        "[Offscreen] 🎵 First TTS audio chunk received, playing alongside original audio..."
      );
      isPlayingAudio = true;
      // Removed muteVideo() call - keep original audio playing
    }

    if (data instanceof Blob) {
      data.arrayBuffer().then((buffer) => processPcmData(buffer));
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
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }

  // Create STEREO buffer (2 channels) so audio plays in both speakers
  const audioBuffer = playbackContext.createBuffer(
    2,
    float32Array.length,
    playbackContext.sampleRate
  );

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

  // When audio finishes playing, track state
  source.onended = () => {
    // Check if this is the last scheduled chunk
    const timeSinceLastScheduled = playbackContext.currentTime - nextStartTime;
    console.log(
      "[Offscreen] Audio chunk ended, timeSinceLastScheduled:",
      timeSinceLastScheduled
    );
    if (timeSinceLastScheduled >= -0.1) {
      // Small tolerance
      console.log("[Offscreen] 🎵 Last TTS audio chunk finished");
      isPlayingAudio = false;
      // Original audio continues playing - no unmute needed
    } else {
      console.log("[Offscreen] More audio chunks pending");
    }
  };
}

function muteVideo() {
  console.log("[Offscreen] 🔇 muteVideo() called, activeTabId:", activeTabId);
  if (activeTabId) {
    console.log(
      "[Offscreen] Sending MUTE_TAB_VIDEO message to background for tab:",
      activeTabId
    );
    chrome.runtime
      .sendMessage({
        type: "MUTE_TAB_VIDEO",
        tabId: activeTabId,
      })
      .then((response) => {
        console.log("[Offscreen] ✅ Mute message acknowledged:", response);
      })
      .catch((err) => {
        console.error("[Offscreen] ❌ Failed to send mute request:", err);
      });
  } else {
    console.error("[Offscreen] ❌ Cannot mute: activeTabId is not set!");
  }
}

function unmuteVideo() {
  console.log("[Offscreen] 🔊 unmuteVideo() called, activeTabId:", activeTabId);
  if (activeTabId) {
    console.log(
      "[Offscreen] Sending UNMUTE_TAB_VIDEO message to background for tab:",
      activeTabId
    );
    chrome.runtime
      .sendMessage({
        type: "UNMUTE_TAB_VIDEO",
        tabId: activeTabId,
      })
      .then((response) => {
        console.log("[Offscreen] ✅ Unmute message acknowledged:", response);
      })
      .catch((err) => {
        console.error("[Offscreen] ❌ Failed to send unmute request:", err);
      });
  } else {
    console.error("[Offscreen] ❌ Cannot unmute: activeTabId is not set!");
  }
}

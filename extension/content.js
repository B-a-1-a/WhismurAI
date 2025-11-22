class LocalPipecatTranslator {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.isConnected = false;
    this.audioQueue = [];
  }

  async initialize(config) {
    try {
      // Connect to local Pipecat server
      this.ws = new WebSocket("ws://localhost:8000/ws/translate");

      await new Promise((resolve, reject) => {
        this.ws.onopen = () => {
          console.log("Connected to Pipecat server");

          // Send configuration
          this.ws.send(
            JSON.stringify({
              type: "config",
              config: {
                source_lang: config.sourceLanguage,
                target_lang: config.targetLanguage,
                mute_original: config.muteOriginal,
                voice_id: config.voiceId || null,
              },
            })
          );

          this.isConnected = true;
        };

        this.ws.onmessage = (event) => {
          const message = JSON.parse(event.data);

          if (message.type === "ready") {
            resolve();
          } else if (message.type === "audio") {
            this.playTranslatedAudio(message);
          } else if (message.type === "text") {
            this.updateTranscript(message.text, message.is_final);
          } else if (message.type === "error") {
            console.error("Server error:", message.message);
            reject(new Error(message.message));
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.isConnected = false;
        };

        // Timeout after 10 seconds
        setTimeout(() => reject(new Error("Connection timeout")), 10000);
      });
    } catch (error) {
      console.error("Failed to connect to server:", error);
      throw error;
    }
  }

  async startCapture(stream) {
    this.mediaStream = stream;
    this.audioContext = new AudioContext({ sampleRate: 16000 });

    const source = this.audioContext.createMediaStreamSource(stream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(this.audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (!this.isConnected) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const int16Data = this.convertFloat32ToInt16(inputData);

      // Convert to base64 and send
      const base64Audio = this.arrayBufferToBase64(int16Data.buffer);

      this.ws.send(
        JSON.stringify({
          type: "audio",
          data: base64Audio,
          sample_rate: 16000,
          num_channels: 1,
        })
      );
    };
  }

  convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  playTranslatedAudio(message) {
    // Decode base64 audio
    const audioData = atob(message.data);
    const audioArray = new Uint8Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      audioArray[i] = audioData.charCodeAt(i);
    }

    // Create audio blob and play
    const blob = new Blob([audioArray], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
  }

  updateTranscript(text, isFinal) {
    chrome.runtime.sendMessage({
      type: "UPDATE_TRANSCRIPT",
      text: text,
      isFinal: isFinal,
    });
  }

  stop() {
    this.isConnected = false;

    if (this.ws) {
      this.ws.close();
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
  }
}

// Global translator instance
let translator = null;

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "START_TRANSLATION") {
    try {
      translator = new LocalPipecatTranslator();
      await translator.initialize(message.config);

      // Request tab capture
      chrome.runtime.sendMessage({ type: "REQUEST_TAB_CAPTURE" });

      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (message.type === "TAB_STREAM_READY") {
    if (translator) {
      await translator.startCapture(message.stream);
    }
  } else if (message.type === "STOP_TRANSLATION") {
    if (translator) {
      translator.stop();
      translator = null;
    }
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

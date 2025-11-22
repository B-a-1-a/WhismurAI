// content.js - Simplified with Pipecat backend

class PipecatTranslator {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.peerConnection = null;
  }

  async initialize(config) {
    // Connect to Pipecat backend via WebSocket
    this.ws = new WebSocket("ws://localhost:8000/translate");

    await new Promise((resolve) => {
      this.ws.onopen = () => {
        console.log("Connected to Pipecat backend");
        // Send configuration
        this.ws.send(
          JSON.stringify({
            source_lang: config.sourceLanguage,
            target_lang: config.targetLanguage,
            deepgram_key: config.deepgramKey,
            translate_key: config.translateKey,
            fish_key: config.fishKey,
            voice_id: config.voiceId,
          })
        );
        resolve();
      };
    });

    // Set up WebRTC for audio streaming (Pipecat uses Daily.co or custom WebRTC)
    await this.setupWebRTC();
  }

  async setupWebRTC() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Listen for incoming audio (translated)
    this.peerConnection.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();
    };

    // Handle WebRTC signaling through WebSocket
    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "offer") {
        await this.peerConnection.setRemoteDescription(message.sdp);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.ws.send(JSON.stringify({ type: "answer", sdp: answer }));
      } else if (message.type === "ice-candidate") {
        await this.peerConnection.addIceCandidate(message.candidate);
      }
    };
  }

  async startCapture(stream) {
    this.mediaStream = stream;

    // Add audio track to peer connection
    stream.getAudioTracks().forEach((track) => {
      this.peerConnection.addTrack(track, stream);
    });

    // Create and send offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.ws.send(JSON.stringify({ type: "offer", sdp: offer }));
  }

  stop() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.ws) {
      this.ws.close();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
  }
}

// Usage
let translator = null;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "START_TRANSLATION") {
    translator = new PipecatTranslator();
    await translator.initialize(message.config);

    // Get tab audio stream from background
    chrome.runtime.sendMessage({ type: "REQUEST_TAB_CAPTURE" });
  } else if (message.type === "TAB_STREAM_READY") {
    // Start streaming to Pipecat
    await translator.startCapture(message.stream);
  } else if (message.type === "STOP_TRANSLATION") {
    if (translator) {
      translator.stop();
      translator = null;
    }
  }
});

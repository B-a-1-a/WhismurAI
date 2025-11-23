/**
 * Fish Audio TTS Integration
 * Handles text-to-speech generation using Fish Audio API
 */

class FishAudioTTS {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://api.fish.audio';
    this.defaultVoice = null; // Default Fish Audio voice ID
    this.customVoice = null; // Custom cloned voice ID
    this.useCustomVoice = false; // Toggle between default and custom
    this.isInitialized = false;
  }

  /**
   * Initialize the TTS service with API key
   */
  async initialize(apiKey, defaultVoiceId = null) {
    if (!apiKey) {
      console.warn('[FishTTS] No API key provided');
      return;
    }
    
    this.apiKey = apiKey;
    this.defaultVoice = defaultVoiceId;
    this.isInitialized = true;
    console.log('[FishTTS] Initialized with API key:', apiKey.substring(0, 8) + '...');
  }

  /**
   * Set the custom cloned voice model ID
   */
  setCustomVoice(modelId) {
    this.customVoice = modelId;
    console.log('[FishTTS] Custom voice set:', modelId);
  }

  /**
   * Toggle between default and custom voice
   */
  setUseCustomVoice(useCustom) {
    this.useCustomVoice = useCustom;
    console.log('[FishTTS] Use custom voice:', useCustom);
  }

  /**
   * Get the current active voice ID
   */
  getActiveVoiceId() {
    if (this.useCustomVoice && this.customVoice) {
      return this.customVoice;
    }
    return this.defaultVoice;
  }

  /**
   * Generate speech from text using Fish Audio API
   * 
   * @param {string} text - Text to convert to speech
   * @param {object} options - Optional parameters
   * @returns {Promise<ArrayBuffer>} - Audio data
   */
  async generateSpeech(text, options = {}) {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('FishAudioTTS not initialized');
    }

    const voiceId = this.getActiveVoiceId();
    
    if (!voiceId) {
      throw new Error('No voice model available');
    }

    console.log(`[FishTTS] Generating speech for: "${text.substring(0, 50)}..." using voice: ${voiceId}`);

    try {
      // Fish Audio API endpoint for TTS
      const response = await fetch(`${this.baseUrl}/v1/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          reference_id: voiceId,
          format: 'pcm', // Raw PCM for low latency
          latency: 'normal', // 'normal' or 'balanced'
          ...options
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fish Audio API error: ${response.status} - ${errorText}`);
      }

      // Return audio data as ArrayBuffer
      const audioData = await response.arrayBuffer();
      console.log(`[FishTTS] Generated ${audioData.byteLength} bytes of audio`);
      
      return audioData;

    } catch (error) {
      console.error('[FishTTS] Speech generation failed:', error);
      throw error;
    }
  }

  /**
   * Stream speech generation (for long texts)
   * 
   * @param {string} text - Text to convert to speech
   * @param {function} onChunk - Callback for each audio chunk
   * @param {object} options - Optional parameters
   */
  async streamSpeech(text, onChunk, options = {}) {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('FishAudioTTS not initialized');
    }

    const voiceId = this.getActiveVoiceId();
    
    if (!voiceId) {
      throw new Error('No voice model available');
    }

    console.log(`[FishTTS] Streaming speech for: "${text.substring(0, 50)}..."`);

    try {
      const response = await fetch(`${this.baseUrl}/v1/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          reference_id: voiceId,
          format: 'pcm',
          latency: 'normal',
          streaming: true, // Enable streaming
          ...options
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fish Audio API error: ${response.status} - ${errorText}`);
      }

      // Process stream
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[FishTTS] Stream complete');
          break;
        }
        
        // Send chunk to callback
        if (onChunk && value) {
          onChunk(value.buffer);
        }
      }

    } catch (error) {
      console.error('[FishTTS] Stream generation failed:', error);
      throw error;
    }
  }

  /**
   * Check if custom voice is available
   */
  hasCustomVoice() {
    return !!this.customVoice;
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      hasCustomVoice: this.hasCustomVoice(),
      usingCustomVoice: this.useCustomVoice && this.hasCustomVoice(),
      activeVoiceId: this.getActiveVoiceId()
    };
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.FishAudioTTS = FishAudioTTS;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FishAudioTTS;
}


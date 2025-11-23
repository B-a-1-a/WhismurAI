// AudioWorklet Processor for PCM Conversion with Resampling
// Runs in a separate audio processing thread for optimal performance

class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Get sample rate from options (passed from AudioContext)
    this.inputSampleRate = options.processorOptions?.sampleRate || 48000;
    this.outputSampleRate = 16000; // Deepgram expects 16kHz
    this.resampleRatio = this.inputSampleRate / this.outputSampleRate; // e.g., 48000/16000 = 3
    
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    console.log(`[PCMProcessor] Input: ${this.inputSampleRate}Hz, Output: ${this.outputSampleRate}Hz, Ratio: ${this.resampleRatio}`);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // If no input, return true to keep processor alive
    if (!input || !input[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Passthrough: Copy input to output so user can still hear tab audio
    if (outputChannel) {
      outputChannel.set(inputChannel);
    }

    // Resample and accumulate samples into buffer
    // Simple decimation: take every Nth sample based on resample ratio
    for (let i = 0; i < inputChannel.length; i += this.resampleRatio) {
      const index = Math.floor(i);
      if (index < inputChannel.length) {
        this.buffer[this.bufferIndex++] = inputChannel[index];

        // When buffer is full, convert and send
        if (this.bufferIndex >= this.bufferSize) {
          this.sendPCMData();
          this.bufferIndex = 0;
        }
      }
    }

    return true; // Keep processor alive
  }

  sendPCMData() {
    // Convert Float32 to Int16 PCM
    const pcmData = new Int16Array(this.bufferSize);
    
    for (let i = 0; i < this.bufferSize; i++) {
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    // Send to main offscreen thread
    this.port.postMessage({
      type: 'pcm-data',
      data: pcmData.buffer
    }, [pcmData.buffer]); // Transfer ownership for efficiency
  }
}

registerProcessor('pcm-processor', PCMProcessor);


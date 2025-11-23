# Backend Setup

## Prerequisites

- Python 3.10 - 3.13 (Python 3.14+ is not supported yet by dependencies)

## Environment Variables

Create a `.env` file in this directory with the following variables:

```env
FISH_API_KEY=your_fish_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
OPENAI_API_KEY=your_openai_key_here
```

## Installation

```bash
# Create virtual environment (ensure using Python 3.10-3.13)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running the Server

```bash
uvicorn server:app --reload
```

The server will start on `http://localhost:8000`

## Using the Translation Endpoint

Connect to the WebSocket endpoint with your target language:

```javascript
// Connect to WebSocket for Spanish translation
const ws = new WebSocket('ws://localhost:8000/ws/translate/es');

// Optional: specify a custom voice ID
const ws = new WebSocket('ws://localhost:8000/ws/translate/es?reference_id=your_voice_id');

// Send audio data (raw PCM, 16kHz, mono)
ws.send(audioBuffer);

// Receive translated audio back
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {
    // This is audio data (raw PCM, 24kHz)
    playAudio(event.data);
  } else {
    // This is JSON metadata (transcripts, translations)
    const msg = JSON.parse(event.data);
    console.log(msg.type, msg.text);
  }
};
```

### Supported Language Codes
- `es` - Spanish
- `fr` - French
- `de` - German
- `ja` - Japanese
- `zh` - Chinese
- `ko` - Korean
- `it` - Italian
- `pt` - Portuguese
- `ru` - Russian
- `ar` - Arabic
- `hi` - Hindi
- `en` - English
- And many more...

## Pipeline Architecture

The translation bot uses a Pipecat pipeline with real-time translation:

### Audio Flow
```
WebSocket Input (16kHz) 
  ↓
Deepgram STT (speech-to-text)
  ↓
Sentence Aggregator (forms complete sentences)
  ↓
OpenAI Translation (gpt-4o-mini)
  ↓
Fish Audio TTS (text-to-speech)
  ↓
WebSocket Output (24kHz)
```

### Service Configuration

#### Deepgram STT
- **WebSocket Endpoint**: `wss://api.deepgram.com/v1/listen`
- **Sample Rate**: 16kHz (default for linear16 encoding)
- **Encoding**: linear16 (raw PCM audio)
- **Low Latency Settings**:
  - `interim_results=True` - Real-time transcription updates
  - `endpointing=300` - 300ms pause detection (faster than default)
  - `utterance_end_ms=1000` - 1s finalization (faster than default)
  - `smart_format=True` - Auto-punctuation for better sentence detection
- **Documentation**: [Deepgram Streaming API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)

#### OpenAI Translation
- **Model**: `gpt-5-nano` ⚡ **Fastest OpenAI model (GPT-5 generation) for ultra-low latency translation**
- **Ultra-Low Latency Configuration**:
  - `temperature=0.0` - Deterministic output (no randomness = faster)
  - `max_tokens=100` - Limited output length for speed
  - Minimal system prompt for fastest processing
  - Streaming enabled for immediate response
- **Speed Rating**: 5/5 stars (Very fast) - OpenAI's fastest model
- **Context Window**: 400,000 tokens (though we only use minimal context)
- **Context Management**: Automatic cleanup every 3 messages to prevent slowdown
- **Supported Languages**: Spanish (es), French (fr), German (de), Japanese (ja), Chinese (zh), Korean (ko), Italian (it), Portuguese (pt), Russian (ru), Arabic (ar), Hindi (hi), Dutch (nl), Polish (pl), Turkish (tr), Vietnamese (vi), Thai (th), Swedish (sv), Danish (da), Norwegian (no), Finnish (fi), English (en)
- **Documentation**: [OpenAI gpt-5-nano Reference](https://platform.openai.com/docs/models/gpt-5-nano)

#### Fish Audio TTS
- **Voice Cloning**: Uses `reference_id` parameter for persistent voice models
- **Voice Model Creation**: 
  ```python
  # Create a persistent voice model via Fish Audio SDK
  voice = client.voices.create(
      title="My Voice",
      voices=[audio_bytes],
      description="Custom voice clone"
  )
  # Use voice.id as reference_id in pipeline
  ```
- **Alternative**: On-the-fly cloning with `ReferenceAudio` objects (not used in this implementation)
- **Latency Mode**: `normal` - Fastest mode (options: `normal`, `balanced`)
- **Documentation**: [Fish Audio Python SDK](https://docs.fish.audio/api-reference/sdk/python/overview)

### Important Notes

#### Pipecat 0.0.95+ Breaking Change
As of pipecat version 0.0.95, `PipelineTask.run()` requires a `PipelineTaskParams` argument:

```python
# Old (pre-0.0.95)
await task.run()

# New (0.0.95+)
await task.run(PipelineTaskParams(loop=asyncio.get_running_loop()))
```

This change was introduced to properly manage the asyncio event loop across the pipeline lifecycle. If you see the error `PipelineTask.run() missing 1 required positional argument: 'params'`, ensure you're passing the `PipelineTaskParams` with the running loop.

#### Audio Format Requirements
- **Input**: Raw PCM audio at 16kHz, mono channel
- **Output**: Raw PCM audio at 24kHz (Fish Audio default)
- **WebSocket Protocol**: Binary frames (not text/JSON)

#### Voice ID Configuration
The default voice ID in `server.py` is a placeholder. To use your own voice:
1. Create a voice model in the [Fish Audio Console](https://fish.audio/app/)
2. Copy the voice ID
3. Update `DEFAULT_VOICE_ID` in `server.py` or pass it via query parameter:
   ```
   ws://localhost:8000/ws/translate/es?reference_id=your_voice_id
   ```

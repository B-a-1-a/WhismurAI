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

## Pipeline Architecture

The translation bot uses a Pipecat pipeline with the following components:

### Audio Flow
```
WebSocket Input (16kHz) → Deepgram STT → OpenAI LLM → Fish Audio TTS → WebSocket Output (24kHz)
```

### Service Configuration

#### Deepgram STT
- **WebSocket Endpoint**: `wss://api.deepgram.com/v1/listen`
- **Sample Rate**: 16kHz (default for linear16 encoding)
- **Encoding**: linear16 (raw PCM audio)
- **Required Query Params**: 
  - `encoding=linear16` (optional, inferred from audio format)
  - `sample_rate=16000` (optional, required only when encoding is specified)
- **Documentation**: [Deepgram Streaming API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)

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
- **Latency Mode**: `balanced` (options: `normal`, `balanced`, `aggressive`)
- **Documentation**: [Fish Audio Python SDK](https://docs.fish.audio/api-reference/sdk/python/overview)

#### OpenAI LLM
- **Model**: `gpt-4o-mini` (fast, cost-effective for translation)
- **System Prompt**: Configured for simultaneous interpretation
- **Context Management**: Uses `OpenAILLMContext` for message history

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

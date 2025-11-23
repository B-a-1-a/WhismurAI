import os
import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams, PipelineTaskParams
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.base_input import BaseInputTransport
from pipecat.transports.base_output import BaseOutputTransport
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    TTSAudioRawFrame,
    StartFrame,
    EndFrame,
    CancelFrame,
    TextFrame,
    TranscriptionFrame,
    LLMTextFrame,
    TTSTextFrame,
    TranslationFrame,
    LLMFullResponseStartFrame,
    LLMFullResponseEndFrame,
    InterruptionFrame
)

class TranscriptProcessor(FrameProcessor):
    def __init__(self, websocket):
        super().__init__()
        self.websocket = websocket

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        try:
            # print(f"TranscriptProcessor Processing frame: {type(frame)}") # Debug logging
            if isinstance(frame, TranscriptionFrame):
                await self.websocket.send_json({
                    "type": "transcript",
                    "mode": "original", 
                    "text": frame.text
                })
            elif isinstance(frame, LLMTextFrame) or isinstance(frame, TextFrame):
                 # Check for specific subclasses like LLMTextFrame which OpenAILLMService likely emits
                await self.websocket.send_json({
                    "type": "transcript",
                    "mode": "translation",
                    "text": frame.text
                })
                print(f"[TranscriptProcessor] Sent translation chunk: {frame.text[:20]}...")

        except Exception as e:
            print(f"TranscriptProcessor: Failed to send message (connection likely closed): {e}")
        
        await self.push_frame(frame, direction)

class FastAPIInputTransport(BaseInputTransport):
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket
        self._receive_task = None

    async def start(self, frame: StartFrame):
        # Call parent start to initialize
        await super().start(frame)
        # Start receiving audio from WebSocket
        self._receive_task = asyncio.create_task(self._receive_audio())

    async def _receive_audio(self):
        """Receive audio bytes from WebSocket and push as frames"""
        chunk_count = 0
        try:
            while True:
                message = await self._websocket.receive_bytes()
                chunk_count += 1
                if chunk_count % 50 == 0:  # Log every 50 chunks to avoid spam
                    print(f"[FastAPIInput] Received {chunk_count} audio chunks (latest: {len(message)} bytes)")
                frame = InputAudioRawFrame(
                    audio=message, 
                    sample_rate=self._params.audio_in_sample_rate, 
                    num_channels=1
                )
                await self.push_frame(frame)
        except Exception as e:
            print(f"WebSocket Input closed: {e}")
            await self.push_frame(CancelFrame())

    async def stop(self, frame: EndFrame):
        # Cancel the receive task
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        await super().stop(frame)

class FastAPIOutputTransport(BaseOutputTransport):
    def __init__(self, websocket, params, **kwargs):
        super().__init__(params, **kwargs)
        self._websocket = websocket
        self._audio_frame_count = 0

    async def start(self, frame: StartFrame):
        """Initialize the output transport and register audio handlers"""
        await super().start(frame)
        # This registers the transport to handle audio frames
        await self.set_transport_ready(frame)
        print("[FastAPIOutput] Transport ready and registered for audio output")

    async def write_audio_frame(self, frame: OutputAudioRawFrame) -> bool:
        """Stream audio frames directly to WebSocket as they arrive

        Handles both OutputAudioRawFrame and TTSAudioRawFrame (which is a subclass).
        Fish Audio TTS outputs TTSAudioRawFrame objects.
        """
        try:
            self._audio_frame_count += 1

            # Log frame type for debugging
            frame_type = "TTS" if isinstance(frame, TTSAudioRawFrame) else "Output"
            if self._audio_frame_count % 10 == 0:  # Log every 10th frame
                print(f"[FastAPIOutput] Streaming {frame_type} audio frame #{self._audio_frame_count}: {len(frame.audio)} bytes")

            # Send raw PCM audio bytes to WebSocket client
            await self._websocket.send_bytes(frame.audio)
            return True
        except Exception as e:
            print(f"[FastAPIOutput] WebSocket error: {e}")
            return False

class FastAPITransport(BaseTransport):
    def __init__(self, websocket, params, **kwargs):
        super().__init__(**kwargs)
        self._input = FastAPIInputTransport(websocket, params)
        self._output = FastAPIOutputTransport(websocket, params, **kwargs)

    def input(self):
        return self._input

    def output(self):
        return self._output

async def run_translation_bot(websocket_client, reference_id, target_lang):
    """
    Run the translation pipeline with Deepgram STT -> OpenAI Translation -> Fish TTS
    
    Pipeline Configuration:
    - Deepgram STT: 16kHz input sample rate (configurable via encoding/sample_rate params)
    - OpenAI LLM: Translates transcribed text to target language
    - Fish Audio TTS: Uses reference_id for voice cloning (persistent voice model)
    
    Note: As of pipecat 0.0.95, PipelineTask.run() requires PipelineTaskParams
    with the asyncio event loop.
    """
    # Custom Transport wrapping FastAPI WebSocket
    # Audio format: 16kHz input (Deepgram default), 24kHz output (Fish Audio)
    transport = FastAPITransport(
        websocket=websocket_client,
        params=TransportParams(
            audio_in_sample_rate=16000,  # Deepgram streaming default
            audio_out_sample_rate=24000,  # Fish Audio output
            audio_out_enabled=True,  # CRITICAL: Enable audio output streaming
        )
    )

    # Deepgram STT Service
    # Streams audio via WebSocket at wss://api.deepgram.com/v1/listen
    # Explicitly configure for 16kHz linear16 PCM audio
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        sample_rate=16000,
        encoding="linear16"
    )
    
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini"
    )

    # Fish Audio TTS Service with optimized settings for low latency
    # Using reference_id for voice cloning and explicit PCM output format
    tts = FishAudioTTSService(
        api_key=os.getenv("FISH_API_KEY"),
        reference_id=reference_id,  # Voice model ID for cloning
        output_format="pcm",  # Explicit PCM format for lowest latency
        sample_rate=24000,  # Match output transport sample rate
    )

    messages = [
        {
            "role": "system",
            "content": f"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation, no explanations or additional text."
        }
    ]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    transcript_sender_original = TranscriptProcessor(websocket_client)
    transcript_sender_translated = TranscriptProcessor(websocket_client)

    pipeline = Pipeline([
        transport.input(),
        stt,
        transcript_sender_original,
        context_aggregator.user(),
        llm,
        transcript_sender_translated,
        tts,
        transport.output(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_usage_metrics=True,
        )
    )
    
    # IMPORTANT: pipecat 0.0.95+ requires PipelineTaskParams with event loop
    # This was changed from the previous signature that took no arguments
    await task.run(PipelineTaskParams(loop=asyncio.get_running_loop()))

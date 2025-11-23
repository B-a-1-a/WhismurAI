import os
import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.base_task import PipelineTaskParams
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.base_input import BaseInputTransport
from pipecat.transports.base_output import BaseOutputTransport
from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame, StartFrame, EndFrame, CancelFrame

# Import custom Whisper and Pyannote services
from whisper_stt import WhisperSTTService
from pyannote_diarization import PyannoteSpeakerDiarizationProcessor

class FastAPIInputTransport(BaseInputTransport):
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket
        self._running = False

    async def start(self, frame):
        # Start is called with a StartFrame, begin listening for audio
        self._running = True
        try:
            # Receive raw bytes from FastAPI websocket
            while self._running:
                message = await self._websocket.receive_bytes()
                audio_frame = InputAudioRawFrame(
                    audio=message,
                    sample_rate=self._params.audio_in_sample_rate,
                    num_channels=1
                )
                await self.push_frame(audio_frame)
        except Exception as e:
            print(f"WebSocket Input closed: {e}")
            await self.push_frame(CancelFrame())

    async def stop(self):
        self._running = False

class FastAPIOutputTransport(BaseOutputTransport):
    def __init__(self, websocket, params, **kwargs):
        super().__init__(params, **kwargs)
        self._websocket = websocket

    async def start(self, frame: StartFrame):
        """Start the output transport"""
        print(f"[Transport] Output transport starting...")
        await super().start(frame)
        print(f"[Transport] Calling set_transport_ready...")
        # Signal transport is ready to receive frames
        await self.set_transport_ready(frame)
        print(f"[Transport] Output transport ready!")

    async def write_audio_frame(self, frame: OutputAudioRawFrame) -> bool:
        """Write audio frame to WebSocket"""
        try:
            print(f"[Transport] Sending audio frame: {len(frame.audio)} bytes")
            await self._websocket.send_bytes(frame.audio)
            return True
        except Exception as e:
            print(f"[Transport] WebSocket Output Error: {e}")
            return False

class FastAPITransport(BaseTransport):
    def __init__(self, websocket, params):
        super().__init__()
        self._input = FastAPIInputTransport(websocket, params)
        self._output = FastAPIOutputTransport(websocket, params)

    def input(self):
        return self._input

    def output(self):
        return self._output

async def run_translation_bot(websocket_client, reference_id, target_lang, use_whisper=False, enable_diarization=False):
    """
    Run the translation pipeline with STT -> OpenAI Translation -> Fish TTS

    Args:
        websocket_client: FastAPI WebSocket connection
        reference_id: Fish Audio voice reference ID
        target_lang: Target language for translation
        use_whisper: If True, use Whisper STT; if False, use Deepgram STT
        enable_diarization: If True, enable speaker diarization with Pyannote
    """
    # Custom Transport wrapping FastAPI WebSocket
    transport = FastAPITransport(
        websocket=websocket_client,
        params=TransportParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        )
    )

    # Choose STT service - OPTIMIZED FOR LOWEST LATENCY
    if use_whisper:
        print(f"[Bot] Using Whisper STT (local transcription)")
        # Use Whisper TINY for lowest latency (fastest model)
        stt = WhisperSTTService(
            model="tiny",  # TINY = fastest, lowest latency for real-time
            language=None,  # Auto-detect language, or specify like "en", "es", etc.
        )
    else:
        print(f"[Bot] Using Deepgram STT (cloud API - RECOMMENDED FOR LOW LATENCY)")
        # Deepgram with optimized settings for real-time translation
        stt = DeepgramSTTService(
            api_key=os.getenv("DEEPGRAM_API_KEY"),
            # Deepgram automatically uses optimal settings for streaming
        )

    # Use GPT-4o-mini for fast translation
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini"  # Fastest available GPT-4 model
    )

    # Fish Audio TTS - Optimized for LOWEST latency based on official Pipecat implementation
    tts = FishAudioTTSService(
        api_key=os.getenv("FISH_API_KEY"),
        reference_id=reference_id,  # Voice model ID for cloning
        model_id="speech-1.5",  # Latest Fish Audio TTS model
        output_format="pcm",  # Raw PCM for lowest latency (no encoding overhead)
        sample_rate=24000,  # Match output sample rate for no resampling
        params=FishAudioTTSService.InputParams(
            latency="balanced",  # Official SDK uses "balanced" or "normal"
            normalize=True,  # Normalize audio levels
            prosody_speed=1.0,  # Normal speed (0.5-2.0 range)
            prosody_volume=0,  # Normal volume (dB adjustment)
        )
    )

    messages = [
        {
            "role": "system",
            "content": f"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation, no explanations or additional text."
        }
    ]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # Build pipeline with optional speaker diarization
    pipeline_components = [transport.input()]

    # Add speaker diarization if enabled
    if enable_diarization:
        print(f"[Bot] Speaker diarization enabled")
        diarization = PyannoteSpeakerDiarizationProcessor(
            auth_token=os.getenv("HUGGINGFACE_TOKEN")  # Optional: add to .env
        )
        pipeline_components.append(diarization)

    # Add core pipeline components
    pipeline_components.extend([
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
    ])

    pipeline = Pipeline(pipeline_components)

    task = PipelineTask(pipeline)

    # Get the current event loop and run the task
    loop = asyncio.get_event_loop()
    await task.run(PipelineTaskParams(loop=loop))

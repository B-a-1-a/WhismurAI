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
from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame, StartFrame, EndFrame, CancelFrame, TextFrame, TranscriptionFrame, LLMTextFrame, TTSTextFrame, TranslationFrame, LLMFullResponseStartFrame, LLMFullResponseEndFrame, InterruptionFrame

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

class ContextManager(FrameProcessor):
    """Manages LLM context to prevent accumulation issues"""
    def __init__(self, context, max_messages=3):
        super().__init__()
        self.context = context
        self.max_messages = max_messages
        self.message_count = 0

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        # Track messages and periodically clear context (keep only system message)
        if isinstance(frame, TranscriptionFrame):
            self.message_count += 1
            if self.message_count >= self.max_messages:
                print("[ContextManager] Clearing conversation history to prevent accumulation")
                # Keep only the system message
                if hasattr(self.context, 'messages') and len(self.context.messages) > 0:
                    system_msg = self.context.messages[0]  # Keep system prompt
                    if hasattr(self.context, 'set_messages'):
                        self.context.set_messages([system_msg])
                    else:
                        self.context._messages = [system_msg]
                self.message_count = 0
        
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
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket

    async def process_frame(self, frame, direction):
        # Filter out frames that we don't need to handle to avoid "not registered" warnings
        if isinstance(frame, (TextFrame, LLMTextFrame, LLMFullResponseStartFrame, LLMFullResponseEndFrame, InterruptionFrame)):
            return

        await super().process_frame(frame, direction)
        
        # Send audio frames to WebSocket
        if isinstance(frame, OutputAudioRawFrame):
            try:
                await self._websocket.send_bytes(frame.audio)
            except Exception as e:
                print(f"WebSocket Output Error: {e}")

class FastAPITransport(BaseTransport):
    def __init__(self, websocket, params):
        super().__init__()
        self._input = FastAPIInputTransport(websocket, params)
        self._output = FastAPIOutputTransport(websocket, params)

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
    # Map language codes to full names for better LLM understanding
    language_names = {
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'ko': 'Korean',
        'it': 'Italian',
        'pt': 'Portuguese'
    }
    
    target_language_name = language_names.get(target_lang, target_lang)
    
    # Custom Transport wrapping FastAPI WebSocket
    # Audio format: 16kHz input (Deepgram default), 24kHz output (Fish Audio)
    transport = FastAPITransport(
        websocket=websocket_client,
        params=TransportParams(
            audio_in_sample_rate=16000,  # Deepgram streaming default
            audio_out_sample_rate=24000,  # Fish Audio output
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
    
    # Fish Audio TTS Service
    # reference_id: Persistent voice model ID created via client.voices.create()
    # or use on-the-fly cloning with ReferenceAudio objects
    # tts = FishAudioTTSService(
    #     api_key=os.getenv("FISH_API_KEY"),
    #     reference_id=reference_id,  # Voice model ID from Fish Audio console
    #     latency="balanced"
    # )

    messages = [
        {
            "role": "system",
            "content": f"""You are a professional simultaneous interpreter. Your task:
1. Translate each input phrase independently into {target_language_name}
2. Output ONLY the {target_language_name} translation - no English, no explanations
3. If the input is incomplete or unclear, translate what you can
4. Each message is independent - do not reference previous translations
5. Be accurate and natural in {target_language_name}"""
        }
    ]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    transcript_sender_original = TranscriptProcessor(websocket_client)
    transcript_sender_translated = TranscriptProcessor(websocket_client)
    # Clear context after every message to ensure independent translation
    context_manager = ContextManager(context, max_messages=1)

    pipeline = Pipeline([
        transport.input(),
        stt,
        context_manager,  # Add context management before sending to LLM
        transcript_sender_original,
        context_aggregator.user(),
        llm,
        transcript_sender_translated,
        # tts,
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

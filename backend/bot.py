import os
import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams, PipelineTaskParams
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext, OpenAILLMContextFrame
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.base_input import BaseInputTransport
from pipecat.transports.base_output import BaseOutputTransport
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    InputAudioRawFrame,
    OutputAudioRawFrame,
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
    InterruptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)


class SentenceAggregator(FrameProcessor):
    """
    Accumulates transcript chunks into complete sentences before passing them downstream.
    Also handles sending 'original' transcript updates to the WebSocket.
    """

    def __init__(self, websocket):
        super().__init__()
        self.websocket = websocket
        self.sentence_buffer = ""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            is_final = getattr(frame, "speech_final", False)
            text = frame.text.strip()

            print(
                f"[SentenceAggregator] Received TranscriptionFrame: text='{text[:50]}...', is_final={is_final}"
            )

            if not text:
                return

            # Strategy: Accumulate text and check for natural sentence boundaries
            # Deepgram's interim results often contain complete phrases/sentences

            # Check if this looks like a sentence ending (has punctuation)
            has_punctuation = text.rstrip().endswith((".", "!", "?", "。", "！", "？"))

            # For interim results, we accumulate and look for sentence boundaries
            if not is_final:
                # Update buffer with latest interim text (replace, don't append)
                # Deepgram sends progressively longer interim results
                self.sentence_buffer = text
                
                # If we detect a sentence ending in interim AND have meaningful content, treat it as complete
                # Require at least 10 characters to avoid sending fragments
                if has_punctuation and len(self.sentence_buffer.strip()) > 10:
                    print(f"[SentenceAggregator] Detected sentence end in interim: {self.sentence_buffer[:80]}")
                    
                    # Send FINAL to UI
                    try:
                        await self.websocket.send_json(
                            {
                                "type": "transcript",
                                "mode": "original",
                                "text": self.sentence_buffer,
                                "is_final": True,
                            }
                        )
                    except Exception as e:
                        print(f"[SentenceAggregator] WS Error: {e}")

                    # Send to LLM for translation only if substantial
                    new_frame = TranscriptionFrame(
                        text=self.sentence_buffer,
                        user_id=frame.user_id,
                        timestamp=frame.timestamp,
                    )
                    await self.push_frame(new_frame, direction)

                    # Clear buffer
                    self.sentence_buffer = ""
                else:

                    # Still building - send interim update but don't translate yet
                    print(f"[SentenceAggregator] Buffering interim: {self.sentence_buffer[:50]}...")

                    try:
                        await self.websocket.send_json(
                            {
                                "type": "transcript",
                                "mode": "original",
                                "text": self.sentence_buffer,
                                "is_final": False,
                            }
                        )
                    except Exception as e:
                        print(f"[SentenceAggregator] WS Error: {e}")
            else:
                # speech_final=True - Deepgram detected end of speech
                # This is the final version, send it
                print(f"[SentenceAggregator] Speech final received: {text[:80]}")

                # Send FINAL to UI
                try:
                    await self.websocket.send_json(
                        {
                            "type": "transcript",
                            "mode": "original",
                            "text": text,
                            "is_final": True,
                        }
                    )
                except Exception as e:
                    print(f"[SentenceAggregator] WS Error: {e}")

                # Send to LLM
                new_frame = TranscriptionFrame(
                    text=text, user_id=frame.user_id, timestamp=frame.timestamp
                )
                await self.push_frame(new_frame, direction)

                # Clear buffer
                self.sentence_buffer = ""

        else:
            # Pass through all other frames
            await self.push_frame(frame, direction)


class TranslationSender(FrameProcessor):
    """
    Handles sending LLM translations to the WebSocket.
    Accumulates streaming chunks into complete sentences before sending.
    """

    def __init__(self, websocket):
        super().__init__()
        self.websocket = websocket
        self.translation_buffer = ""
        self.last_sent = ""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        try:

            # Only handle LLM output frames
            if isinstance(frame, LLMTextFrame):
                # Accumulate translation chunks
                if frame.text:
                    self.translation_buffer += frame.text
                    
                    # Check if we have a complete phrase or word boundary
                    # Send more frequently for smoother updates
                    new_text_length = len(self.translation_buffer) - len(self.last_sent)
                    ends_with_space = self.translation_buffer.endswith(' ')
                    has_punctuation = self.translation_buffer.rstrip().endswith(('.', '!', '?', ',', ';', ':', '。', '！', '？'))
                    
                    if (has_punctuation or 
                        (ends_with_space and new_text_length > 15) or  # Send at word boundaries after 15 chars
                        new_text_length > 30):  # Force send after 30 chars
                        
                        # Send only the new portion
                        new_text = self.translation_buffer[len(self.last_sent):]
                        if new_text.strip():
                            await self.websocket.send_json({
                                "type": "transcript",
                                "mode": "translation",
                                "text": new_text,
                                "is_final": True
                            })
                            print(f"[TranslationSender] Sent translation chunk: {new_text[:50]}...")
                            self.last_sent = self.translation_buffer
                            
            elif isinstance(frame, LLMFullResponseEndFrame):
                # Send any remaining buffered translation
                if len(self.translation_buffer) > len(self.last_sent):
                    final_text = self.translation_buffer[len(self.last_sent):]
                    if final_text.strip():
                    await self.websocket.send_json({
                        "type": "transcript",
                        "mode": "translation",
                            "text": final_text,
                        "is_final": True
                    })
                    print(f"[TranslationSender] Sent final translation: {final_text[:50]}...")
                
                # Reset buffers for next translation
                self.translation_buffer = ""
                self.last_sent = ""


        except Exception as e:
            print(f"TranslationSender: Failed to send message: {e}")

        await self.push_frame(frame, direction)


class TranslationPreprocessor(FrameProcessor):
    """Preprocesses TranscriptionFrame to ensure LLM translates it"""

    def __init__(self, target_lang_name):
        super().__init__()
        self.target_lang_name = target_lang_name

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            # Create a TextFrame with explicit translation instruction
            # This ensures the LLM knows it needs to translate
            translation_prompt = f"Translate to {self.target_lang_name}: {frame.text}"
            text_frame = TextFrame(text=translation_prompt)
            print(
                f"[TranslationPreprocessor] Preprocessing: '{frame.text[:60]}...' -> '{translation_prompt[:60]}...'"
            )
            await self.push_frame(text_frame, direction)
        else:
            await self.push_frame(frame, direction)


class ContextManager(FrameProcessor):

    """
    Manages LLM context and converts TranscriptionFrame to OpenAILLMContextFrame.
    Resets context to just the system prompt for each user sentence to ensure
    the LLM receives a fresh translation request every time.
    """
    def __init__(self, context):

        super().__init__()
        self.context = context
        self.system_message = context.messages[0] if context.messages else None

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        
        if isinstance(frame, TranscriptionFrame):
            # Reset context to the original system prompt before sending to LLM
            if self.system_message:
                self.context.set_messages([self.system_message])
            else:
                self.context.set_messages([])

            # Add user message to context
            self.context.add_message({"role": "user", "content": frame.text})
            
            # Create context frame for the LLM
            context_frame = OpenAILLMContextFrame(self.context)
            await self.push_frame(context_frame, direction)
        else:
            # Pass through all other frames
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
                    print(
                        f"[FastAPIInput] Received {chunk_count} audio chunks (latest: {len(message)} bytes)"
                    )
                if chunk_count == 1:
                    print(
                        f"[FastAPIInput] First audio chunk received: {len(message)} bytes"
                    )
                frame = InputAudioRawFrame(
                    audio=message,
                    sample_rate=self._params.audio_in_sample_rate,
                    num_channels=1,
                )
                await self.push_frame(frame)
        except Exception as e:
            print(f"[FastAPIInput] WebSocket Input closed: {e}")
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
        if isinstance(
            frame,
            (
                TextFrame,
                LLMTextFrame,
                LLMFullResponseStartFrame,
                LLMFullResponseEndFrame,
                InterruptionFrame,
                TTSStartedFrame,
                TTSStoppedFrame,
            ),
        ):
            return

        await super().process_frame(frame, direction)

        # Handle TTS audio frames by converting them to output frames
        if isinstance(frame, TTSAudioRawFrame):
            try:
                print(f"[Output] Sending TTS audio chunk: {len(frame.audio)} bytes")
                await self._websocket.send_bytes(frame.audio)
            except Exception as e:
                print(f"[Output] WebSocket Error sending TTS audio: {e}")
        # Send regular output audio frames to WebSocket
        elif isinstance(frame, OutputAudioRawFrame):
            try:
                await self._websocket.send_bytes(frame.audio)
            except Exception as e:
                print(f"[Output] WebSocket Error: {e}")


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
    """
    # Custom Transport wrapping FastAPI WebSocket
    transport = FastAPITransport(
        websocket=websocket_client,
        params=TransportParams(
            audio_in_sample_rate=16000,  # Deepgram streaming default
            audio_out_sample_rate=24000,  # Fish Audio output
        ),
    )

    # Deepgram STT Service
    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")
    if not deepgram_api_key:
        print("[ERROR] DEEPGRAM_API_KEY not found in environment variables!")
        raise ValueError("DEEPGRAM_API_KEY is required")

    print(f"[STT] Initializing Deepgram with API key: {deepgram_api_key[:8]}...")
    stt = DeepgramSTTService(
        api_key=deepgram_api_key,
        sample_rate=16000,
        encoding="linear16",
        # Enable interim results and configure endpointing to detect speech boundaries
        interim_results=True,  # Get real-time updates
        endpointing=300,  # Reduced to 300ms for faster response (was 800ms)
        smart_format=True,  # Auto-punctuation and capitalization
        utterance_end_ms=1000,  # Reduced to 1s for faster finalization (was 1500ms)
        punctuate=True,  # Ensure punctuation is added for sentence detection
    )
    print("[STT] Deepgram STT Service initialized with low latency settings")
    
    # OpenAI LLM Service for Translation - using gpt-4o-mini for fastest response
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        print("[ERROR] OPENAI_API_KEY not found in environment variables!")
        raise ValueError("OPENAI_API_KEY is required")
    
    print(f"[Translation] Initializing OpenAI with API key: {openai_api_key[:8]}...")
    print(f"[Translation] Target language: {target_lang}")
    
    # Language name mapping for better translation prompt
    lang_names = {
        'es': 'Spanish',
        'fr': 'French', 
        'de': 'German',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'ko': 'Korean',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'nl': 'Dutch',
        'pl': 'Polish',
        'tr': 'Turkish',
        'vi': 'Vietnamese',
        'th': 'Thai',
        'sv': 'Swedish',
        'da': 'Danish',
        'no': 'Norwegian',
        'fi': 'Finnish',
        'en': 'English'
    }
    target_lang_name = lang_names.get(target_lang.lower(), target_lang)
    
    # Create LLM context for translation with minimal, focused system prompt
    llm_context = OpenAILLMContext(
        messages=[
            {
                "role": "system",
                "content": f"Translate the user's speech to {target_lang_name}. Output ONLY the translation, nothing else. Be concise and natural."
            }
        ]
    )
    
    llm_model = "gpt-4o-mini"
    llm = OpenAILLMService(
        api_key=openai_api_key,
        model=llm_model,  # More capable model that follows translation instructions reliably
        params=OpenAILLMService.InputParams(
            max_completion_tokens=100,  # Limit output length for speed
        )
    )
    print(f"[Translation] OpenAI LLM initialized with {llm_model}")
    

    # Fish Audio TTS Service
    fish_api_key = os.getenv("FISH_AUDIO_API_KEY")
    if not fish_api_key:
        print("[ERROR] FISH_AUDIO_API_KEY not found in environment variables!")
        raise ValueError("FISH_AUDIO_API_KEY is required")

    print(f"[TTS] Initializing Fish Audio TTS with API key: {fish_api_key[:8]}...")
    print(f"[TTS] Using voice reference ID: {reference_id}")
    tts = FishAudioTTSService(
        api_key=fish_api_key,
        reference_id=reference_id,
        sample_rate=24000,
        # Enable latency optimization
        latency="normal",  # Options: "normal" or "balanced" - normal is faster
    )
    print("[TTS] Fish Audio TTS Service initialized with low latency mode")


    # Processors
    sentence_aggregator = SentenceAggregator(websocket_client)
    translation_sender = TranslationSender(websocket_client)
    context_manager = ContextManager(llm_context)
    
    # LLMToTTS: Convert LLM text output to TTSTextFrame for Fish Audio
    class LLMToTTS(FrameProcessor):
        """Converts LLM translation output (LLMTextFrame only) to TTSTextFrame"""
        def __init__(self):
            super().__init__()
            self.accumulated_text = ""
            self.last_tts_sent = ""
            
        async def process_frame(self, frame, direction):
            await super().process_frame(frame, direction)
            
            # Only accumulate LLM output chunks, NOT TranscriptionFrames
            if isinstance(frame, LLMTextFrame):
                self.accumulated_text += frame.text
                
                # Check if we have enough text to send to TTS
                # Send at natural boundaries (punctuation or word boundaries)
                new_text = self.accumulated_text[len(self.last_tts_sent):]
                
                # Send to TTS when we have a complete phrase or sentence
                if (new_text.rstrip().endswith(('.', '!', '?', ',', ':', ';')) or
                    (new_text.endswith(' ') and len(new_text) > 20) or
                    len(new_text) > 40):
                    
                    if new_text.strip():
                        tts_frame = TTSTextFrame(text=new_text.strip())
                        print(f"[LLMToTTS] Sending to TTS: {new_text.strip()[:50]}...")
                        await self.push_frame(tts_frame, direction)
                        self.last_tts_sent = self.accumulated_text
                        
            elif isinstance(frame, LLMFullResponseEndFrame):
                # Send any remaining text to TTS
                final_text = self.accumulated_text[len(self.last_tts_sent):]
                if final_text.strip():
                    tts_frame = TTSTextFrame(text=final_text.strip())
                    print(f"[LLMToTTS] Sending final TTS: {final_text.strip()[:50]}...")
                    await self.push_frame(tts_frame, direction)
                
                # Reset for next translation
                    self.accumulated_text = ""
                self.last_tts_sent = ""
                await self.push_frame(frame, direction)
            else:
                await self.push_frame(frame, direction)
    
    llm_to_tts = LLMToTTS()

    pipeline = Pipeline([
        transport.input(),
        stt,                      # Speech to text
        sentence_aggregator,      # Buffer and form complete sentences
        context_manager,          # Manage LLM context (prevent accumulation)
        llm,                      # Translate with OpenAI gpt-4o-mini
        translation_sender,       # Send translations to WebSocket
        llm_to_tts,              # Convert LLM output to TTS format
        tts,                      # Text to speech
        transport.output(),       # Send audio back
    ])
    
    print("[Pipeline] Translation pipeline created with components:")
    print("  1. FastAPI Input Transport")
    print("  2. Deepgram STT")
    print("  3. Sentence Aggregator (sends original transcript)")
    print("  4. Context Manager (prevents accumulation)")
    print("  5. OpenAI LLM (gpt-5-nano translation - fastest)")
    print("  6. Translation Sender (sends translated text)")
    print("  7. LLM to TTS Converter")

    print("  8. Fish Audio TTS")
    print("  9. FastAPI Output Transport")

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    await task.run(PipelineTaskParams(loop=asyncio.get_running_loop()))

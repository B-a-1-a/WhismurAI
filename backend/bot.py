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

                # If we detect a sentence ending in interim, treat it as complete
                if has_punctuation:
                    print(
                        f"[SentenceAggregator] Detected sentence end in interim: {self.sentence_buffer[:80]}"
                    )

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

                    # Send to LLM
                    new_frame = TranscriptionFrame(
                        text=self.sentence_buffer,
                        user_id=frame.user_id,
                        timestamp=frame.timestamp,
                    )
                    await self.push_frame(new_frame, direction)

                    # Clear buffer
                    self.sentence_buffer = ""
                else:
                    # Still building - send interim update
                    print(
                        f"[SentenceAggregator] Buffering interim: {self.sentence_buffer[:50]}..."
                    )
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
    """

    def __init__(self, websocket):
        super().__init__()
        self.websocket = websocket

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)

        try:
            if isinstance(frame, LLMTextFrame) or isinstance(frame, TextFrame):
                # LLM translations - send to WebSocket
                # We treat LLM output chunks as final for the UI to append?
                # Or should we accumulate? For now, existing behavior is to send as final.
                if frame.text and frame.text.strip():
                    # Check if translation is actually different from English (basic check)
                    text_lower = frame.text.lower().strip()
                    # If it looks like English (starts with common English words), warn
                    common_english_starters = [
                        "i ",
                        "you ",
                        "the ",
                        "a ",
                        "an ",
                        "but ",
                        "and ",
                        "or ",
                        "in ",
                        "on ",
                        "at ",
                        "to ",
                        "for ",
                        "with ",
                        "have ",
                        "has ",
                        "had ",
                        "was ",
                        "were ",
                        "is ",
                        "are ",
                        "am ",
                        "be ",
                        "been ",
                        "do ",
                        "does ",
                        "did ",
                        "can ",
                        "could ",
                        "will ",
                        "would ",
                        "should ",
                        "may ",
                        "might ",
                        "must ",
                        "this ",
                        "that ",
                        "these ",
                        "those ",
                        "what ",
                        "when ",
                        "where ",
                        "who ",
                        "why ",
                        "how ",
                        "everyone ",
                        "everybody ",
                        "someone ",
                        "somebody ",
                        "anyone ",
                        "anybody ",
                        "nothing ",
                        "something ",
                        "everything ",
                    ]
                    is_likely_english = any(
                        text_lower.startswith(starter)
                        for starter in common_english_starters
                    )

                    if is_likely_english and len(text_lower) > 10:
                        print(
                            f"[TranslationSender] ⚠️ WARNING: LLM output looks like English, not translation: '{frame.text[:60]}...'"
                        )

                    await self.websocket.send_json(
                        {
                            "type": "transcript",
                            "mode": "translation",
                            "text": frame.text,
                            "is_final": True,
                        }
                    )
                    print(
                        f"[TranslationSender] ✅ Sent translation: {frame.text[:50]}..."
                    )

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
            print(
                f"[ContextManager] Received TranscriptionFrame for LLM: '{frame.text[:60]}...' (message #{self.message_count})"
            )
            if self.message_count >= self.max_messages:
                print(
                    "[ContextManager] Clearing conversation history to prevent accumulation"
                )
                # Keep only the system message
                if hasattr(self.context, "messages") and len(self.context.messages) > 0:
                    system_msg = self.context.messages[0]  # Keep system prompt
                    if hasattr(self.context, "set_messages"):
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
    Run the TTS pipeline with Deepgram STT -> Fish TTS (skipping translation for now)
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

    # OpenAI LLM Service for Translation
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        print("[ERROR] OPENAI_API_KEY not found in environment variables!")
        raise ValueError("OPENAI_API_KEY is required")

    # Map language codes to full names for better translation
    lang_names = {
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "ja": "Japanese",
        "ko": "Korean",
        "zh": "Chinese",
        "ar": "Arabic",
        "en": "English",
    }
    target_lang_name = lang_names.get(target_lang.lower(), target_lang)

    print(
        f"[LLM] Initializing OpenAI LLM for translation to {target_lang_name} ({target_lang})..."
    )
    # Create a very explicit system prompt with examples
    if target_lang.lower() == "es":
        example_input = "Hello, how are you?"
        example_output = "Hola, ¿cómo estás?"
    elif target_lang.lower() == "fr":
        example_input = "Hello, how are you?"
        example_output = "Bonjour, comment allez-vous?"
    elif target_lang.lower() == "de":
        example_input = "Hello, how are you?"
        example_output = "Hallo, wie geht es dir?"
    elif target_lang.lower() == "ja":
        example_input = "Hello, how are you?"
        example_output = "こんにちは、元気ですか？"
    else:
        example_input = "Hello, how are you?"
        example_output = f"[Translate to {target_lang_name}]"

    # Create a very explicit system prompt
    system_prompt = f"""You are a translation API. Translate English text to {target_lang_name}.

IMPORTANT RULES:
1. You receive English text as input
2. You MUST respond with ONLY the {target_lang_name} translation
3. NEVER output the original English text
4. NEVER add explanations or notes
5. Output format: ONLY the translated text in {target_lang_name}

Example 1:
User: "Hello"
Assistant: "{example_output.split(',')[0] if ',' in example_output else example_output}"

Example 2:
User: "How are you?"
Assistant: "{example_output.split(',')[1].strip() if ',' in example_output else example_output}"

Remember: Every user message is English text to translate. Respond ONLY with {target_lang_name} translation."""

    llm_context = OpenAILLMContext(
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            }
        ]
    )

    llm = OpenAILLMService(
        api_key=openai_api_key,
        model="gpt-4o-mini",  # Fast and cost-effective for translation
        context=llm_context,
    )
    print("[LLM] OpenAI LLM Service initialized for translation")

    # New processors
    sentence_aggregator = SentenceAggregator(websocket_client)
    translation_preprocessor = TranslationPreprocessor(target_lang_name)
    translation_sender = TranslationSender(websocket_client)
    context_manager = ContextManager(llm_context, max_messages=5)

    # Debug processor to log what LLM receives and outputs
    class LLMDebugProcessor(FrameProcessor):
        """Debug processor to log LLM input/output"""

        async def process_frame(self, frame, direction):
            await super().process_frame(frame, direction)
            if isinstance(frame, TranscriptionFrame):
                print(
                    f"[LLMDebug] 📥 LLM INPUT (TranscriptionFrame): '{frame.text[:80]}...'"
                )
            elif isinstance(frame, TextFrame):
                print(f"[LLMDebug] 📥 LLM INPUT (TextFrame): '{frame.text[:80]}...'")
            elif isinstance(frame, LLMTextFrame):
                print(f"[LLMDebug] 📤 LLM OUTPUT: '{frame.text[:80]}...'")
            await self.push_frame(frame, direction)

    llm_debug_input = LLMDebugProcessor()
    llm_debug_output = LLMDebugProcessor()

    # TranscriptToTTS: Convert LLMTextFrame (translation) to TTSTextFrame for Fish Audio
    class TranslationToTTS(FrameProcessor):
        """Converts LLM translation frames to TTSTextFrame for TTS processing"""

        async def process_frame(self, frame, direction):
            await super().process_frame(frame, direction)

            if isinstance(frame, LLMTextFrame):
                # Convert translation to TTS frame
                tts_frame = TTSTextFrame(text=frame.text)
                print(
                    f"[TranslationToTTS] Converting translation to TTS: {frame.text[:50]}..."
                )
                await self.push_frame(tts_frame, direction)
            else:
                await self.push_frame(frame, direction)

    translation_to_tts = TranslationToTTS()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            sentence_aggregator,  # Buffer and form sentences FIRST
            translation_preprocessor,  # Preprocess with translation instruction
            context_manager,  # Manage LLM context to prevent accumulation
            llm_debug_input,  # Debug: log LLM input
            llm,  # Translate to target language
            llm_debug_output,  # Debug: log LLM output
            translation_sender,  # Send translations to WebSocket
            translation_to_tts,  # Convert translation to TTS frame
            tts,  # Generate audio from translation
            transport.output(),
        ]
    )

    print("[Pipeline] Pipeline created with components:")
    print("  1. FastAPI Input Transport")
    print("  2. Deepgram STT")
    print("  3. Sentence Aggregator")
    print("  4. Context Manager")
    print("  5. OpenAI LLM (Translation)")
    print("  6. Translation Sender")
    print("  7. Translation to TTS Converter")
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

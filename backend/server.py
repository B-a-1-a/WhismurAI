import asyncio
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import json
import logging
from typing import Optional

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.transports.base_transport import BaseTransport
from pipecat.frames.frames import Frame, AudioRawFrame, TextFrame

from processors.translation_processor import TranslationProcessor
from processors.fish_audio_tts import FishAudioTTSService

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Live Translation API")

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WebSocketTransport(BaseTransport):
    """Custom transport for WebSocket communication with browser extension"""

    def __init__(self, websocket: WebSocket):
        super().__init__()
        self.websocket = websocket
        self._running = False

    async def start(self):
        self._running = True

    async def stop(self):
        self._running = False
        await self.websocket.close()

    async def send_frame(self, frame: Frame):
        """Send frames back to the browser"""
        if isinstance(frame, AudioRawFrame):
            # Send audio data as base64
            import base64

            audio_b64 = base64.b64encode(frame.audio).decode("utf-8")
            await self.websocket.send_json(
                {
                    "type": "audio",
                    "data": audio_b64,
                    "sample_rate": frame.sample_rate,
                    "num_channels": frame.num_channels,
                }
            )
        elif isinstance(frame, TextFrame):
            # Send transcript
            await self.websocket.send_json(
                {"type": "text", "text": frame.text, "is_final": True}
            )

    async def receive_frames(self):
        """Receive audio frames from browser"""
        try:
            while self._running:
                message = await self.websocket.receive_json()

                if message["type"] == "audio":
                    # Decode audio from base64
                    import base64

                    audio_data = base64.b64decode(message["data"])

                    frame = AudioRawFrame(
                        audio=audio_data,
                        sample_rate=message.get("sample_rate", 16000),
                        num_channels=message.get("num_channels", 1),
                    )
                    yield frame

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected")
            self._running = False


class TranslationSession:
    """Manages a single translation session"""

    def __init__(
        self,
        websocket: WebSocket,
        source_lang: str,
        target_lang: str,
        mute_original: bool = False,
        voice_id: Optional[str] = None,
    ):
        self.websocket = websocket
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.mute_original = mute_original
        self.voice_id = voice_id
        self.task = None

    async def start(self):
        """Start the translation pipeline"""
        try:
            # Initialize transport
            transport = WebSocketTransport(self.websocket)

            # Initialize services
            stt = DeepgramSTTService(
                api_key=os.getenv("DEEPGRAM_API_KEY"),
                language=self.source_lang,
                model="nova-2",
                interim_results=True,
            )

            # Translation processor
            translator = TranslationProcessor(
                source_lang=self.source_lang,
                target_lang=self.target_lang,
                api_key=os.getenv("GOOGLE_TRANSLATE_API_KEY"),
            )

            # Fish Audio TTS
            tts = FishAudioTTSService(
                api_key=os.getenv("FISH_AUDIO_API_KEY"), voice_id=self.voice_id
            )

            # Build pipeline
            pipeline = Pipeline(
                [
                    stt,  # Speech to text
                    translator,  # Translate
                    tts,  # Text to speech
                ]
            )

            # Create task
            self.task = PipelineTask(pipeline, params={"transport": transport})

            # Run pipeline
            runner = PipelineRunner()

            # Start receiving audio from browser
            receive_task = asyncio.create_task(self._receive_audio(transport))

            # Run the pipeline
            await runner.run(self.task)

            # Cleanup
            receive_task.cancel()

        except Exception as e:
            logger.error(f"Error in translation session: {e}")
            await self.websocket.send_json({"type": "error", "message": str(e)})

    async def _receive_audio(self, transport: WebSocketTransport):
        """Continuously receive audio from browser"""
        try:
            async for frame in transport.receive_frames():
                # Process through pipeline
                if self.task:
                    await self.task.queue_frame(frame)
        except asyncio.CancelledError:
            pass

    async def stop(self):
        """Stop the translation pipeline"""
        if self.task:
            await self.task.cancel()


# Active sessions
active_sessions = {}


@app.get("/")
async def root():
    return {"service": "Live Translation API", "status": "running", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "deepgram": os.getenv("DEEPGRAM_API_KEY") is not None,
        "translate": os.getenv("GOOGLE_TRANSLATE_API_KEY") is not None,
        "fish_audio": os.getenv("FISH_AUDIO_API_KEY") is not None,
    }


@app.websocket("/ws/translate")
async def websocket_translate(websocket: WebSocket):
    """WebSocket endpoint for real-time translation"""
    await websocket.accept()
    session_id = id(websocket)

    try:
        # Receive configuration from client
        config_msg = await websocket.receive_json()

        logger.info(f"New translation session: {config_msg}")

        # Validate config
        if config_msg.get("type") != "config":
            await websocket.send_json(
                {"type": "error", "message": "First message must be config"}
            )
            return

        config = config_msg.get("config", {})

        # Create session
        session = TranslationSession(
            websocket=websocket,
            source_lang=config.get("source_lang", "en"),
            target_lang=config.get("target_lang", "es"),
            mute_original=config.get("mute_original", False),
            voice_id=config.get("voice_id"),
        )

        active_sessions[session_id] = session

        # Send ready signal
        await websocket.send_json(
            {"type": "ready", "message": "Translation service ready"}
        )

        # Start translation
        await session.start()

    except WebSocketDisconnect:
        logger.info(f"Session {session_id} disconnected")
    except Exception as e:
        logger.error(f"Error in WebSocket connection: {e}")
    finally:
        # Cleanup
        if session_id in active_sessions:
            await active_sessions[session_id].stop()
            del active_sessions[session_id]


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"Starting server on {host}:{port}")

    uvicorn.run(app, host=host, port=port, log_level="info")

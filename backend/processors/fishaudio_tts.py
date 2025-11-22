from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import Frame, TextFrame, AudioRawFrame
import httpx
import logging
import io
import wave

logger = logging.getLogger(__name__)


class FishAudioTTSService(FrameProcessor):
    """Text-to-Speech using Fish Audio API with voice cloning"""

    def __init__(self, api_key: str, voice_id: str = None):
        super().__init__()
        self.api_key = api_key
        self.voice_id = voice_id or "default"
        self._client = None

    async def start(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    async def stop(self):
        if self._client:
            await self._client.aclose()

    async def process_frame(self, frame: Frame, direction):
        """Process incoming frames"""
        await super().process_frame(frame, direction)

        if isinstance(frame, TextFrame):
            # Skip empty text
            if not frame.text or not frame.text.strip():
                return

            try:
                # Convert text to speech
                audio_data = await self.text_to_speech(frame.text)

                # Create audio frame
                audio_frame = AudioRawFrame(
                    audio=audio_data,
                    sample_rate=16000,  # Adjust based on Fish Audio output
                    num_channels=1,
                )

                await self.push_frame(audio_frame)

            except Exception as e:
                logger.error(f"TTS error: {e}")
        else:
            # Pass through other frame types
            await self.push_frame(frame)

    async def text_to_speech(self, text: str) -> bytes:
        """Convert text to speech using Fish Audio API"""
        try:
            # Adjust this based on Fish Audio's actual API endpoint and format
            response = await self._client.post(
                "https://api.fish.audio/v1/tts",  # Update with actual endpoint
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "voice_id": self.voice_id,
                    "format": "wav",  # or 'mp3', 'pcm' based on API
                    "sample_rate": 16000,
                },
            )

            response.raise_for_status()

            # Return raw audio bytes
            return response.content

        except httpx.HTTPError as e:
            logger.error(f"HTTP error during TTS: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during TTS: {e}")
            raise

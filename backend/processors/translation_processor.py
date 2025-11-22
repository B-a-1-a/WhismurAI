from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import Frame, TextFrame
import httpx
import logging

logger = logging.getLogger(__name__)


class TranslationProcessor(FrameProcessor):
    """Translates text frames from source to target language"""

    def __init__(self, source_lang: str, target_lang: str, api_key: str):
        super().__init__()
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.api_key = api_key
        self._client = None

    async def start(self):
        self._client = httpx.AsyncClient(timeout=10.0)

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
                # Translate the text
                translated_text = await self.translate(frame.text)

                logger.info(f"Original: {frame.text}")
                logger.info(f"Translated: {translated_text}")

                # Create new frame with translated text
                new_frame = TextFrame(text=translated_text)
                await self.push_frame(new_frame)

            except Exception as e:
                logger.error(f"Translation error: {e}")
                # Pass through original on error
                await self.push_frame(frame)
        else:
            # Pass through other frame types
            await self.push_frame(frame)

    async def translate(self, text: str) -> str:
        """Translate text using Google Cloud Translation API"""
        try:
            response = await self._client.post(
                "https://translation.googleapis.com/language/translate/v2",
                json={
                    "q": text,
                    "source": self.source_lang,
                    "target": self.target_lang,
                    "key": self.api_key,
                    "format": "text",
                },
            )

            response.raise_for_status()
            data = response.json()

            return data["data"]["translations"][0]["translatedText"]

        except httpx.HTTPError as e:
            logger.error(f"HTTP error during translation: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during translation: {e}")
            raise

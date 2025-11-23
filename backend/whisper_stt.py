import asyncio
import numpy as np
import whisper
import torch
from typing import AsyncGenerator
from pipecat.services.ai_services import STTService
from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
    ErrorFrame
)
from loguru import logger

class WhisperSTTService(STTService):
    """
    Custom Whisper STT Service for Pipecat
    Handles real-time audio transcription using OpenAI's Whisper model
    """

    def __init__(
        self,
        model: str = "base",
        language: str = None,
        device: str = None,
        **kwargs
    ):
        super().__init__(**kwargs)

        # Detect device (CUDA, MPS for Mac, or CPU)
        if device is None:
            if torch.cuda.is_available():
                device = "cuda"
            elif torch.backends.mps.is_available():
                device = "mps"
            else:
                device = "cpu"

        logger.info(f"Loading Whisper model '{model}' on device '{device}'")

        self._model_name = model
        self._language = language
        self._device = device
        self._model = whisper.load_model(model, device=device)

        # Audio buffering for real-time processing - OPTIMIZED FOR LOW LATENCY
        self._audio_buffer = np.array([], dtype=np.float32)
        self._buffer_duration = 1.5  # Process every 1.5 seconds (reduced from 3s for lower latency)
        self._sample_rate = 16000
        self._min_buffer_size = int(self._sample_rate * self._buffer_duration)

        logger.info(f"Whisper STT initialized (model={model}, device={device}, language={language})")

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        """Process audio chunks and yield transcription frames"""
        try:
            # Convert bytes to numpy array (16-bit PCM to float32)
            audio_np = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0

            # Add to buffer
            self._audio_buffer = np.concatenate([self._audio_buffer, audio_np])

            # Process if buffer is large enough
            if len(self._audio_buffer) >= self._min_buffer_size:
                # Take chunk from buffer
                chunk = self._audio_buffer[:self._min_buffer_size]
                self._audio_buffer = self._audio_buffer[self._min_buffer_size:]

                # Run Whisper transcription in thread pool to avoid blocking
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    self._transcribe_chunk,
                    chunk
                )

                if result and result.get("text", "").strip():
                    text = result["text"].strip()
                    logger.debug(f"Transcribed: {text}")

                    # Yield transcription frame
                    yield TranscriptionFrame(text=text, user_id="user", timestamp=0)

        except Exception as e:
            logger.error(f"Error in Whisper STT: {e}")
            yield ErrorFrame(error=str(e))

    def _transcribe_chunk(self, audio_chunk: np.ndarray) -> dict:
        """Transcribe a single audio chunk using Whisper"""
        try:
            # Pad or trim to 30 seconds (Whisper's expected input length)
            audio_padded = whisper.pad_or_trim(audio_chunk)

            # Compute mel spectrogram
            mel = whisper.log_mel_spectrogram(audio_padded).to(self._device)

            # Detect language if not specified
            if self._language is None:
                _, probs = self._model.detect_language(mel)
                detected_lang = max(probs, key=probs.get)
                logger.debug(f"Detected language: {detected_lang}")

            # Decode audio
            options = whisper.DecodingOptions(
                language=self._language,
                fp16=(self._device == "cuda"),  # Use FP16 only on CUDA
                without_timestamps=True
            )
            result = whisper.decode(self._model, mel, options)

            return {"text": result.text}

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {"text": ""}

    async def process_frame(self, frame: Frame, direction):
        """Process incoming frames"""
        await super().process_frame(frame, direction)

        if isinstance(frame, InputAudioRawFrame):
            # Process audio frame
            async for result_frame in self.run_stt(frame.audio):
                await self.push_frame(result_frame, direction)
        else:
            # Pass through other frames
            await self.push_frame(frame, direction)

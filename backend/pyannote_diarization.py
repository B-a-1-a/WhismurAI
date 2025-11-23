import asyncio
import numpy as np
import torch
from typing import AsyncGenerator, Optional
from pyannote.audio import Pipeline
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    TextFrame,
    ErrorFrame
)
from loguru import logger
import io
import wave

class PyannoteSpeakerDiarizationProcessor(FrameProcessor):
    """
    Pyannote Speaker Diarization Processor for Pipecat
    Identifies different speakers in the audio stream
    """

    def __init__(
        self,
        auth_token: Optional[str] = None,
        **kwargs
    ):
        super().__init__(**kwargs)

        if auth_token is None:
            logger.warning("No Hugging Face auth token provided. Pyannote may not work without it.")
            logger.info("Get a token at: https://huggingface.co/settings/tokens")
            logger.info("Accept pyannote model terms at: https://huggingface.co/pyannote/speaker-diarization")

        self._auth_token = auth_token
        self._pipeline = None
        self._initialized = False

        # Audio buffering for diarization
        self._audio_buffer = np.array([], dtype=np.float32)
        self._buffer_duration = 10.0  # Process every 10 seconds for speaker detection
        self._sample_rate = 16000
        self._min_buffer_size = int(self._sample_rate * self._buffer_duration)

        # Speaker tracking
        self._current_speaker = None
        self._speaker_changes = []

        logger.info("Pyannote Speaker Diarization Processor initialized")

    async def _lazy_init(self):
        """Lazy initialization of the Pyannote pipeline"""
        if not self._initialized:
            try:
                logger.info("Loading Pyannote speaker diarization pipeline...")
                loop = asyncio.get_event_loop()

                # Load pipeline in thread pool (blocking operation)
                self._pipeline = await loop.run_in_executor(
                    None,
                    self._load_pipeline
                )

                self._initialized = True
                logger.info("Pyannote pipeline loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load Pyannote pipeline: {e}")
                logger.error("Speaker diarization will be disabled")

    def _load_pipeline(self):
        """Load the Pyannote pipeline (blocking)"""
        if self._auth_token:
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=self._auth_token
            )
        else:
            # Try without auth token (may fail)
            pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1")

        # Move to GPU if available
        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
        elif torch.backends.mps.is_available():
            pipeline.to(torch.device("mps"))

        return pipeline

    async def process_frame(self, frame: Frame, direction):
        """Process incoming frames"""
        await super().process_frame(frame, direction)

        if isinstance(frame, InputAudioRawFrame):
            # Initialize pipeline if needed
            if not self._initialized:
                await self._lazy_init()

            # Process audio for speaker diarization
            if self._initialized and self._pipeline:
                await self._process_audio(frame.audio, direction)

        # Always pass through the frame
        await self.push_frame(frame, direction)

    async def _process_audio(self, audio: bytes, direction):
        """Process audio for speaker diarization"""
        try:
            # Convert bytes to numpy array
            audio_np = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0

            # Add to buffer
            self._audio_buffer = np.concatenate([self._audio_buffer, audio_np])

            # Process if buffer is large enough
            if len(self._audio_buffer) >= self._min_buffer_size:
                # Take chunk from buffer
                chunk = self._audio_buffer[:self._min_buffer_size]
                # Keep some overlap for continuity
                overlap = int(self._sample_rate * 2.0)  # 2 seconds overlap
                self._audio_buffer = self._audio_buffer[self._min_buffer_size - overlap:]

                # Run diarization in thread pool
                loop = asyncio.get_event_loop()
                speaker_info = await loop.run_in_executor(
                    None,
                    self._diarize_chunk,
                    chunk
                )

                if speaker_info:
                    # Check if speaker changed
                    dominant_speaker = speaker_info.get("dominant_speaker")
                    if dominant_speaker and dominant_speaker != self._current_speaker:
                        self._current_speaker = dominant_speaker
                        logger.info(f"Speaker changed to: {dominant_speaker}")

                        # Optionally push a frame indicating speaker change
                        await self.push_frame(
                            TextFrame(text=f"[Speaker: {dominant_speaker}]"),
                            direction
                        )

        except Exception as e:
            logger.error(f"Error in speaker diarization: {e}")

    def _diarize_chunk(self, audio_chunk: np.ndarray) -> dict:
        """Perform speaker diarization on audio chunk"""
        try:
            # Create a temporary WAV file in memory
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(self._sample_rate)
                # Convert float32 back to int16
                audio_int16 = (audio_chunk * 32768).astype(np.int16)
                wav_file.writeframes(audio_int16.tobytes())

            wav_buffer.seek(0)

            # Run diarization
            diarization = self._pipeline({"waveform": torch.from_numpy(audio_chunk).unsqueeze(0),
                                          "sample_rate": self._sample_rate})

            # Extract speaker information
            speakers = {}
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                duration = turn.end - turn.start
                if speaker not in speakers:
                    speakers[speaker] = 0.0
                speakers[speaker] += duration

            # Find dominant speaker
            if speakers:
                dominant_speaker = max(speakers, key=speakers.get)
                logger.debug(f"Speakers detected: {speakers}, Dominant: {dominant_speaker}")
                return {
                    "dominant_speaker": dominant_speaker,
                    "all_speakers": speakers
                }

            return {}

        except Exception as e:
            logger.error(f"Diarization error: {e}")
            return {}

    def get_current_speaker(self) -> Optional[str]:
        """Get the currently identified speaker"""
        return self._current_speaker

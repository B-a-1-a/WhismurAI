"""
Simplified backend that only handles Speech-to-Text (STT).
Translation and TTS are handled on the frontend for better performance.
"""

import os
import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams, PipelineTaskParams
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.base_input import BaseInputTransport
from pipecat.transports.base_output import BaseOutputTransport
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    InputAudioRawFrame, StartFrame, EndFrame, CancelFrame, 
    TranscriptionFrame
)

class TranscriptSender(FrameProcessor):
    """
    Sends transcripts directly to the WebSocket for frontend processing.
    The frontend will handle translation and TTS.
    """
    def __init__(self, websocket):
        super().__init__()
        self.websocket = websocket
        self.last_transcript = ""
        
    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        
        if isinstance(frame, TranscriptionFrame):
            is_final = getattr(frame, 'speech_final', False)
            text = frame.text.strip()
            
            if not text:
                await self.push_frame(frame, direction)
                return

            # Only send if text has changed or is final
            if text != self.last_transcript or is_final:
                print(f"[TranscriptSender] Sending {'final' if is_final else 'interim'}: {text[:80]}...")
                
                try:
                    await self.websocket.send_json({
                        "type": "transcript",
                        "text": text,
                        "is_final": is_final,
                        "language": "en"  # Source language
                    })
                    
                    if is_final:
                        self.last_transcript = ""
                    else:
                        self.last_transcript = text
                        
                except Exception as e:
                    print(f"[TranscriptSender] Error sending transcript: {e}")
        
        await self.push_frame(frame, direction)


class FastAPIInputTransport(BaseInputTransport):
    """Receives audio from WebSocket"""
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket
        self._receive_task = None

    async def start(self, frame: StartFrame):
        await super().start(frame)
        self._receive_task = asyncio.create_task(self._receive_audio())

    async def _receive_audio(self):
        """Receive audio bytes from WebSocket and push as frames"""
        chunk_count = 0
        try:
            while True:
                message = await self._websocket.receive_bytes()
                chunk_count += 1
                
                if chunk_count == 1:
                    print(f"[Input] First audio chunk received: {len(message)} bytes")
                elif chunk_count % 100 == 0:
                    print(f"[Input] Received {chunk_count} audio chunks")
                
                frame = InputAudioRawFrame(
                    audio=message, 
                    sample_rate=self._params.audio_in_sample_rate, 
                    num_channels=1
                )
                await self.push_frame(frame)
        except Exception as e:
            print(f"[Input] WebSocket closed: {e}")
            await self.push_frame(CancelFrame())

    async def stop(self, frame: EndFrame):
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        await super().stop(frame)


class FastAPIOutputTransport(BaseOutputTransport):
    """Minimal output transport - we don't send audio back anymore"""
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket

    async def process_frame(self, frame, direction):
        # We only process control frames, no audio output
        if not isinstance(frame, (StartFrame, EndFrame, CancelFrame)):
            return
        await super().process_frame(frame, direction)


class SimpleTransport(BaseTransport):
    """Transport wrapper for WebSocket communication"""
    def __init__(self, websocket, params):
        super().__init__()
        self._input = FastAPIInputTransport(websocket, params)
        self._output = FastAPIOutputTransport(websocket, params)

    def input(self):
        return self._input

    def output(self):
        return self._output


async def run_stt_pipeline(websocket_client):
    """
    Simplified pipeline that only does Speech-to-Text.
    Frontend handles translation and TTS for better performance.
    """
    
    print("\n" + "="*60)
    print("[Pipeline] Starting simplified STT-only pipeline")
    print("[Pipeline] Translation and TTS will be handled by frontend")
    print("="*60 + "\n")
    
    # Create transport
    transport = SimpleTransport(
        websocket=websocket_client,
        params=TransportParams(
            audio_in_sample_rate=16000,  # Deepgram streaming default
            audio_out_sample_rate=16000,  # Not used but required
        )
    )

    # Initialize Deepgram STT
    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")
    if not deepgram_api_key:
        print("[ERROR] DEEPGRAM_API_KEY not found in environment variables!")
        raise ValueError("DEEPGRAM_API_KEY is required")
    
    print(f"[STT] Initializing Deepgram with API key: {deepgram_api_key[:8]}...")
    
    stt = DeepgramSTTService(
        api_key=deepgram_api_key,
        sample_rate=16000,
        encoding="linear16",
        interim_results=True,        # Real-time transcription updates
        endpointing=300,             # Fast endpointing (300ms)
        smart_format=True,           # Auto-punctuation and capitalization
        utterance_end_ms=800,        # Detect end of utterance quickly
        punctuate=True,             # Add punctuation
        language="en",              # Source language
        model="nova-2",             # Latest Deepgram model
    )
    
    print("[STT] Deepgram STT Service initialized successfully")

    # Create transcript sender
    transcript_sender = TranscriptSender(websocket_client)

    # Build simplified pipeline
    pipeline = Pipeline([
        transport.input(),      # Receive audio
        stt,                   # Convert to text
        transcript_sender,     # Send to frontend
        transport.output(),    # Minimal output handling
    ])
    
    print("\n[Pipeline] Components:")
    print("  1. WebSocket Audio Input")
    print("  2. Deepgram Speech-to-Text") 
    print("  3. Transcript Sender (to frontend)")
    print("  4. Frontend handles translation (Google Translate)")
    print("  5. Frontend handles TTS (Web Speech API)")
    print("\n[Pipeline] Ready to process audio\n")

    # Create and run pipeline task
    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            enable_usage_metrics=True,
        )
    )
    
    await task.run(PipelineTaskParams(loop=asyncio.get_running_loop()))

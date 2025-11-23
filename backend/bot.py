import os
import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.base_input import BaseInputTransport
from pipecat.transports.base_output import BaseOutputTransport
from pipecat.frames.frames import InputAudioRawFrame, OutputAudioRawFrame, StartFrame, EndFrame, CancelFrame

class FastAPIInputTransport(BaseInputTransport):
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket

    async def start(self, frame_handler):
        self._handler = frame_handler
        try:
            # Receive raw bytes from FastAPI websocket
            while True:
                message = await self._websocket.receive_bytes()
                frame = InputAudioRawFrame(
                    audio=message, 
                    sample_rate=self._params.audio_in_sample_rate, 
                    num_channels=1
                )
                await self._handler(frame)
        except Exception as e:
            print(f"WebSocket Input closed: {e}")
            await self._handler(CancelFrame())

    async def stop(self):
        pass

class FastAPIOutputTransport(BaseOutputTransport):
    def __init__(self, websocket, params):
        super().__init__(params)
        self._websocket = websocket

    async def start(self, frame_handler):
        pass

    async def process_frame(self, frame, direction):
        if isinstance(frame, OutputAudioRawFrame):
            try:
                await self._websocket.send_bytes(frame.audio)
            except Exception as e:
                print(f"WebSocket Output Error: {e}")
        elif isinstance(frame, (StartFrame, EndFrame)):
            pass

    async def stop(self):
        pass

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
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        )
    )

    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))
    
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini"
    )
    
    tts = FishAudioTTSService(
        api_key=os.getenv("FISH_API_KEY"),
        reference_id=reference_id,
        latency="balanced"
    )

    messages = [
        {
            "role": "system",
            "content": f"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation, no explanations or additional text."
        }
    ]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
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
    # No setup needed for custom transport as we handle it in init
    await task.run()

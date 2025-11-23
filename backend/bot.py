import os
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.services.openai import OpenAILLMService
from pipecat.services.fish import FishTTSService
from pipecat.transports.network.websocket_server import WebSocketServerTransport, WebSocketServerParams
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

async def run_translation_bot(websocket_client, reference_id, target_lang):
    # Input: 16kHz (from Extension), Output: 24kHz (Fish Audio default)
    transport = WebSocketServerTransport(
        params=WebSocketServerParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
            add_wav_header=False
        )
    )

    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))
    
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini"
    )
    
    # Fish TTS: Uses the ID passed
    tts = FishTTSService(
        api_key=os.getenv("FISH_API_KEY"),
        reference_id=reference_id,
        latency="balanced"
    )

    messages = [
        {
            "role": "system",
            "content": f"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation."
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

    task = PipelineTask(pipeline)
    await transport.setup(websocket_client)
    await task.run()


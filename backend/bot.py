import os
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.transports.network.websocket_server import WebSocketServerTransport, WebSocketServerParams
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

async def run_translation_bot(websocket_client, reference_id, target_lang):
    """
    Run the translation pipeline with Deepgram STT -> OpenAI Translation -> Fish TTS
    
    Args:
        websocket_client: WebSocket connection from the client
        reference_id: Fish Audio voice ID to use for TTS
        target_lang: Target language code (e.g., 'es', 'fr', 'de', 'ja')
    """
    # Input: 16kHz (from Extension), Output: 24kHz (Fish Audio default)
    transport = WebSocketServerTransport(
        params=WebSocketServerParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
            add_wav_header=False
        )
    )

    # Speech-to-Text: Deepgram
    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))
    
    # Translation: OpenAI GPT-4o-mini
    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini"
    )
    
    # Text-to-Speech: Fish Audio (using the provided reference_id)
    tts = FishAudioTTSService(
        api_key=os.getenv("FISH_API_KEY"),
        reference_id=reference_id,
        latency="balanced"
    )

    # System prompt for translation
    messages = [
        {
            "role": "system",
            "content": f"You are a simultaneous interpreter. Translate the input text immediately into {target_lang}. Output ONLY the translation, no explanations or additional text."
        }
    ]
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # Build the pipeline
    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
    ])

    # Run the pipeline
    task = PipelineTask(pipeline)
    await transport.setup(websocket_client)
    await task.run()


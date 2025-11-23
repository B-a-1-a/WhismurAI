import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from bot import run_translation_bot
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Live Translation Backend")

# Enable CORS for Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default Generic Voice ID from Fish Audio
# Replace this with a real voice ID from your Fish Audio console
DEFAULT_VOICE_ID = "7f92f8afb8ec43bf81429cc1c9199cb1"

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Live Translation Backend",
        "endpoints": {
            "websocket": "/ws/translate/{target_lang}"
        }
    }

@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    """
    WebSocket endpoint for real-time translation

    Args:
        target_lang: Target language code (e.g., 'es', 'fr', 'de', 'ja')

    Query Parameters:
        reference_id: Optional Fish Audio voice ID (defaults to DEFAULT_VOICE_ID)
        stt: STT service to use - "deepgram" (default, fastest) or "whisper"
        diarization: Enable speaker diarization - "true" or "false" (default)
    """
    await websocket.accept()

    # Get voice reference ID from query params, or use default
    ref_id = websocket.query_params.get("reference_id", DEFAULT_VOICE_ID)

    # Get STT service preference (default to Deepgram for lowest latency)
    stt_service = websocket.query_params.get("stt", "deepgram").lower()
    use_whisper = (stt_service == "whisper")

    # Get diarization preference (default to False)
    enable_diarization = websocket.query_params.get("diarization", "false").lower() == "true"

    print(f"[WebSocket] Starting translation pipeline")
    print(f"[WebSocket] Target Language: {target_lang}")
    print(f"[WebSocket] Voice ID: {ref_id}")
    print(f"[WebSocket] STT Service: {'Whisper (local)' if use_whisper else 'Deepgram (cloud)'}")
    print(f"[WebSocket] Speaker Diarization: {'Enabled' if enable_diarization else 'Disabled'}")

    try:
        await run_translation_bot(
            websocket,
            ref_id,
            target_lang,
            use_whisper=use_whisper,
            enable_diarization=enable_diarization
        )
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        await websocket.close()


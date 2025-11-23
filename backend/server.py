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
    """
    await websocket.accept()
    
    # Get voice reference ID from query params, or use default
    ref_id = websocket.query_params.get("reference_id", DEFAULT_VOICE_ID)
    
    print(f"\n{'='*60}")
    print(f"[WebSocket] New connection established")
    print(f"[WebSocket] Target Language: {target_lang}")
    print(f"[WebSocket] Voice ID: {ref_id}")
    print(f"{'='*60}\n")
    
    try:
        await run_translation_bot(websocket, ref_id, target_lang)
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        import traceback
        traceback.print_exc()
        await websocket.close()


import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from bot_simplified import run_stt_pipeline  # Simplified STT-only pipeline
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

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "Live Translation Backend (STT Only)",
        "version": "2.0",
        "info": "Translation and TTS handled by frontend for better performance",
        "endpoints": {
            "websocket": "/ws/translate/{target_lang}"
        }
    }

@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    """
    WebSocket endpoint for real-time speech-to-text
    Frontend handles translation and TTS for better performance
    
    Args:
        target_lang: Target language code (e.g., 'es', 'fr', 'de', 'ja')
                    This is sent to frontend for translation configuration
    """
    await websocket.accept()
    
    print(f"\n{'='*60}")
    print(f"[WebSocket] New connection established")
    print(f"[WebSocket] Target Language: {target_lang}")
    print(f"[WebSocket] Mode: STT Only (Frontend Translation)")
    print(f"{'='*60}\n")
    
    try:
        # Send target language to frontend
        await websocket.send_json({
            "type": "config",
            "target_language": target_lang,
            "source_language": "en"
        })
        
        # Run simplified STT-only pipeline
        await run_stt_pipeline(websocket)
        
    except WebSocketDisconnect:
        print(f"[WebSocket] Client disconnected")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.close()
        except:
            pass


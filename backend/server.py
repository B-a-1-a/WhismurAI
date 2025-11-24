import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from bot import run_translation_bot  # Full translation pipeline (STT → Translation → TTS)
from voice_manager import get_voice_manager
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
        "service": "Live Translation Backend",
        "version": "1.0",
        "info": "Full pipeline: STT → Translation → TTS",
        "endpoints": {
            "websocket": "/ws/translate/{target_lang}",
            "voice_clone": "/api/clone-voice",
            "voice_models": "/api/voice-models"
        }
    }

@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    """
    WebSocket endpoint for real-time translation
    
    Args:
        target_lang: Target language code (e.g., 'es', 'fr', 'de', 'ja')
    
    Query Parameters:
        reference_id: Optional Fish Audio voice ID (defaults to generic voice)
    """
    await websocket.accept()
    
    # Get voice reference ID from query params, or use default
    ref_id = websocket.query_params.get("reference_id", None)
    
    print(f"\n{'='*60}")
    print(f"[WebSocket] New connection established")
    print(f"[WebSocket] Target Language: {target_lang}")
    print(f"[WebSocket] Voice ID: {ref_id or 'default'}")
    print(f"{'='*60}\n")
    
    try:
        # Run full translation pipeline (STT → Translation → TTS)
        await run_translation_bot(websocket, ref_id, target_lang)
        
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

@app.post("/api/clone-voice")
async def clone_voice(
    audio: UploadFile = File(...),
    url: str = Form(...),
    title: str = Form(None)
):
    """
    Create a Fish Audio voice model from uploaded audio.
    
    Args:
        audio: Audio file (WAV or MP3, minimum 10 seconds)
        url: Source URL for the audio
        title: Optional custom title for the voice model
        
    Returns:
        Voice model information including model_id
    """
    try:
        print(f"\n{'='*60}")
        print(f"[Voice Clone] Received request for URL: {url}")
        print(f"[Voice Clone] Audio file: {audio.filename}, content_type: {audio.content_type}")
        
        # Validate audio file type
        if audio.content_type not in ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3']:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio format: {audio.content_type}. Please use WAV or MP3."
            )
        
        # Read audio data
        audio_data = await audio.read()
        print(f"[Voice Clone] Audio data size: {len(audio_data)} bytes")
        
        # Validate minimum audio length (rough estimate: 16kHz, 16-bit, mono = 32KB/sec)
        min_size = 32000 * 5  # 5 seconds minimum
        if len(audio_data) < min_size:
            raise HTTPException(
                status_code=400,
                detail="Audio too short. Minimum 5 seconds required for voice cloning."
            )
        
        # Create voice model
        voice_manager = get_voice_manager()
        result = await voice_manager.create_voice_model(
            audio_data=audio_data,
            url=url,
            title=title
        )
        
        print(f"[Voice Clone] Successfully created model: {result['model_id']}")
        print(f"{'='*60}\n")
        
        return JSONResponse(content={
            "status": "success",
            "data": result
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Voice Clone] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/voice-models")
async def list_voice_models():
    """
    List all stored voice models.
    
    Returns:
        List of voice model information
    """
    try:
        voice_manager = get_voice_manager()
        models = voice_manager.list_voice_models()
        
        return JSONResponse(content={
            "status": "success",
            "data": models
        })
        
    except Exception as e:
        print(f"[Voice Models] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/voice-models/{url:path}")
async def get_voice_model(url: str):
    """
    Get voice model for a specific URL.
    
    Args:
        url: Source URL
        
    Returns:
        Voice model information or 404 if not found
    """
    try:
        voice_manager = get_voice_manager()
        model = voice_manager.get_voice_model(url)
        
        if model is None:
            raise HTTPException(status_code=404, detail="Voice model not found for this URL")
        
        return JSONResponse(content={
            "status": "success",
            "data": model
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Voice Model] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/voice-models/{url:path}")
async def delete_voice_model(url: str):
    """
    Delete voice model for a specific URL.
    
    Args:
        url: Source URL
        
    Returns:
        Success status
    """
    try:
        voice_manager = get_voice_manager()
        deleted = voice_manager.delete_voice_model(url)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Voice model not found for this URL")
        
        return JSONResponse(content={
            "status": "success",
            "message": "Voice model deleted"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Voice Model Delete] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


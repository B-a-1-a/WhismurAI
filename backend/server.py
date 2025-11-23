import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from bot import run_translation_bot
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default Generic Voice ID
DEFAULT_VOICE_ID = "7f92f8afb8ec43bf81429cc1c9199cb1" 

@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    await websocket.accept()
    # We always use DEFAULT_VOICE_ID for now as cloning is disabled
    ref_id = DEFAULT_VOICE_ID
    print(f"Starting pipeline. Voice: {ref_id} for Lang: {target_lang}")
    await run_translation_bot(websocket, ref_id, target_lang)


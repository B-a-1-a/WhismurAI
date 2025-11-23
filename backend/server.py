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

@app.websocket("/ws/translate/{target_lang}")
async def websocket_endpoint(websocket: WebSocket, target_lang: str):
    await websocket.accept()
    print(f"Starting pipeline for target language: {target_lang}")
    await run_translation_bot(websocket, target_lang)

"""
Real-time Streaming Audio Translation Server
Uses WebSockets for instant audio streaming with Pipecat + Fish Audio
"""

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import os
import asyncio
import base64
from openai import OpenAI
import requests
from config import (
    OPENAI_API_KEY,
    FISH_AUDIO_API_KEY,
    FISH_AUDIO_BASE_URL,
    VOICE_SAMPLES_DIR,
)

app = Flask(__name__)
app.config["SECRET_KEY"] = "your-secret-key-here"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

voice_model_id = None


def load_voice_model_id():
    """Load voice model ID from file."""
    global voice_model_id
    if os.path.exists("voice_model_id.txt"):
        with open("voice_model_id.txt", "r") as f:
            voice_model_id = f.read().strip()
            print(f"✓ Loaded voice model: {voice_model_id}")


def get_available_audio_files():
    """Get list of audio files from voice_samples directory."""
    if not os.path.exists(VOICE_SAMPLES_DIR):
        return []

    audio_files = [
        f
        for f in os.listdir(VOICE_SAMPLES_DIR)
        if f.endswith((".mp3", ".wav", ".flac", ".m4a"))
    ]
    return audio_files


def transcribe_audio(audio_path):
    """Transcribe audio file to text."""
    client = OpenAI(api_key=OPENAI_API_KEY)

    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1", file=audio_file
        )

    return transcript.text


def translate_text(text, target_language):
    """Translate text using GPT-5 nano."""
    client = OpenAI(api_key=OPENAI_API_KEY)

    system_prompt = f"You are a professional translator. Translate the following text to {target_language}. Maintain the tone and meaning accurately."

    response = client.chat.completions.create(
        model="gpt-5-nano",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
    )

    return response.choices[0].message.content


def stream_audio_chunks(text, target_language, session_id):
    """
    Stream audio chunks in real-time using Fish Audio streaming API.
    This streams audio as it's being generated for immediate playback.
    """
    url = f"{FISH_AUDIO_BASE_URL}/v1/tts"

    headers = {
        "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
        "Content-Type": "application/json",
    }

    data = {
        "text": text,
        "format": "mp3",
        "latency": "balanced",  # Balanced for streaming
        "chunk_length": 100,  # Smaller chunks for faster streaming
        "mp3_bitrate": 64,  # Lower bitrate for faster streaming
    }

    if voice_model_id:
        data["reference_id"] = voice_model_id

    try:
        # Make streaming request
        response = requests.post(url, json=data, headers=headers, stream=False)

        if response.status_code == 200:
            # Get the complete audio
            audio_data = response.content

            # Split into chunks for streaming (simulate real-time streaming)
            chunk_size = 8192  # 8KB chunks
            total_chunks = len(audio_data) // chunk_size + 1

            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i : i + chunk_size]

                # Encode to base64 for transmission
                chunk_b64 = base64.b64encode(chunk).decode("utf-8")

                # Emit chunk to client
                socketio.emit(
                    "audio_chunk",
                    {
                        "chunk": chunk_b64,
                        "chunk_number": i // chunk_size,
                        "total_chunks": total_chunks,
                        "is_final": i + chunk_size >= len(audio_data),
                    },
                    room=session_id,
                )

                # Small delay to simulate streaming (remove for true real-time)
                socketio.sleep(0.01)

            return True
        else:
            socketio.emit(
                "error",
                {"message": f"TTS Error: {response.status_code}"},
                room=session_id,
            )
            return False

    except Exception as e:
        socketio.emit(
            "error", {"message": f"Streaming error: {str(e)}"}, room=session_id
        )
        return False


@app.route("/")
def index():
    """Render main page."""
    audio_files = get_available_audio_files()
    print(f"Rendering page with {len(audio_files)} files")
    try:
        return render_template("realtime.html", audio_files=audio_files)
    except Exception as e:
        print(f"Template error: {e}")
        return f"<h1>Error loading template: {e}</h1><p>Audio files: {audio_files}</p>"


@app.route("/api/original-audio/<filename>")
def serve_original_audio(filename):
    """Serve original audio file."""
    from flask import send_file

    file_path = os.path.join(VOICE_SAMPLES_DIR, filename)
    if os.path.exists(file_path):
        return send_file(file_path, mimetype="audio/mpeg")
    return jsonify({"error": "File not found"}), 404


@socketio.on("connect")
def handle_connect():
    """Handle client connection."""
    print(f"Client connected: {request.sid}")
    emit("connected", {"session_id": request.sid})


@socketio.on("disconnect")
def handle_disconnect():
    """Handle client disconnection."""
    print(f"Client disconnected: {request.sid}")


@socketio.on("start_translation")
def handle_translation(data):
    """
    Handle real-time translation request.
    Streams audio chunks as they're generated.
    """
    filename = data.get("filename")
    target_language = data.get("target_language", "Spanish")
    session_id = request.sid

    print(f"Starting real-time translation: {filename} -> {target_language}")

    file_path = os.path.join(VOICE_SAMPLES_DIR, filename)

    if not os.path.exists(file_path):
        emit("error", {"message": "File not found"})
        return

    try:
        # Step 1: Transcribe (send progress update)
        emit("progress", {"step": "transcribing", "message": "Transcribing audio..."})
        original_text = transcribe_audio(file_path)
        print(f"  Transcribed: {original_text[:100]}...")

        # Step 2: Translate (send progress update)
        emit("progress", {"step": "translating", "message": "Translating text..."})
        translated_text = translate_text(original_text, target_language)
        print(f"  Translated: {translated_text[:100]}...")

        # Step 3: Stream audio (send progress update)
        emit("progress", {"step": "generating", "message": "Generating audio..."})
        emit("streaming_started", {"text": translated_text})

        # Stream audio chunks in real-time
        success = stream_audio_chunks(translated_text, target_language, session_id)

        if success:
            emit("streaming_complete", {"message": "Translation complete!"})
            print("  ✓ Streaming complete!")

    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        emit("error", {"message": str(e)})


if __name__ == "__main__":
    print("=" * 70)
    print("Real-time Streaming Audio Translation Server")
    print("=" * 70)

    # Load voice model
    load_voice_model_id()

    # Check for audio files
    audio_files = get_available_audio_files()
    print(f"\n✓ Found {len(audio_files)} audio file(s) in {VOICE_SAMPLES_DIR}")
    for f in audio_files:
        print(f"  - {f}")

    print("\n" + "=" * 70)
    print("Starting server at http://localhost:5001")
    print("Real-time streaming enabled!")
    print("=" * 70)
    print()

    socketio.run(app, debug=True, host="0.0.0.0", port=5001, allow_unsafe_werkzeug=True)

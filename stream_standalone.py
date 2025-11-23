"""
Real-time Streaming Audio Translation - FIXED
"""

from flask import Flask, request, jsonify, send_file
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import os
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
    global voice_model_id
    if os.path.exists("voice_model_id.txt"):
        with open("voice_model_id.txt", "r") as f:
            voice_model_id = f.read().strip()
            print(f"✓ Loaded voice model: {voice_model_id}")


def get_available_audio_files():
    if not os.path.exists(VOICE_SAMPLES_DIR):
        return []
    return [
        f
        for f in os.listdir(VOICE_SAMPLES_DIR)
        if f.endswith((".mp3", ".wav", ".flac", ".m4a"))
    ]


def transcribe_audio(audio_path):
    client = OpenAI(api_key=OPENAI_API_KEY)
    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1", file=audio_file
        )
    return transcript.text


def translate_text(text, target_language):
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-5-nano",
        messages=[
            {
                "role": "system",
                "content": f"Translate to {target_language}. Maintain tone and meaning.",
            },
            {"role": "user", "content": text},
        ],
    )
    return response.choices[0].message.content


def stream_audio_chunks(text, session_id):
    url = f"{FISH_AUDIO_BASE_URL}/v1/tts"
    headers = {
        "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "text": text,
        "format": "mp3",
        "latency": "balanced",
        "chunk_length": 100,
        "mp3_bitrate": 64,
    }

    if voice_model_id:
        data["reference_id"] = voice_model_id

    try:
        response = requests.post(url, json=data, headers=headers)
        if response.status_code == 200:
            audio_data = response.content
            chunk_size = 8192
            total_chunks = len(audio_data) // chunk_size + 1

            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i : i + chunk_size]
                chunk_b64 = base64.b64encode(chunk).decode("utf-8")
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
        socketio.emit("error", {"message": f"Error: {str(e)}"}, room=session_id)
        return False


@app.route("/")
def index():
    audio_files = get_available_audio_files()
    # Use render_template instead of embedded HTML
    try:
        from flask import render_template

        return render_template("realtime.html", audio_files=audio_files)
    except:
        # Fallback to simple HTML
        options = "".join([f'<option value="{f}">{f}</option>' for f in audio_files])
        return f"""<!DOCTYPE html><html><head><title>Audio Translation</title>
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
<style>body{{font-family:Arial;padding:20px;background:#667eea}}
h1{{color:white}}select{{padding:10px;margin:10px 0;width:300px}}</style></head>
<body><h1>🎙️ Audio Translation</h1>
<select id="audio-select"><option>--Select--</option>{options}</select><br>
<select id="lang"><option>Spanish</option><option>French</option></select><br>
<label><input type="checkbox" id="toggle" disabled> Translate</label>
<p id="status">Select audio file</p>
<audio id="orig" controls style="display:none"></audio>
<audio id="trans" controls style="display:none"></audio>
<script>const socket=io();let file=null;
document.getElementById('audio-select').onchange=e=>{{file=e.target.value;document.getElementById('toggle').disabled=!file;document.getElementById('orig').src='/api/original-audio/'+file}};
document.getElementById('toggle').onchange=e=>{{if(e.target.checked){{socket.emit('start_translation',{{filename:file,target_language:document.getElementById('lang').value}})}}}};
socket.on('progress',d=>document.getElementById('status').textContent=d.message);
socket.on('audio_chunk',d=>console.log('chunk',d.chunk_number));
socket.on('streaming_complete',()=>document.getElementById('status').textContent='Done!');
socket.on('error',d=>alert(d.message));</script></body></html>"""


@app.route("/api/original-audio/<filename>")
def serve_audio(filename):
    file_path = os.path.join(VOICE_SAMPLES_DIR, filename)
    if os.path.exists(file_path):
        return send_file(file_path, mimetype="audio/mpeg")
    return jsonify({"error": "Not found"}), 404


@socketio.on("connect")
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on("start_translation")
def handle_translation(data):
    filename = data.get("filename")
    target_language = data.get("target_language", "Spanish")
    session_id = request.sid

    print(f"Translation: {filename} -> {target_language}")

    file_path = os.path.join(VOICE_SAMPLES_DIR, filename)
    if not os.path.exists(file_path):
        emit("error", {"message": "File not found"})
        return

    try:
        emit("progress", {"step": "transcribing", "message": "Transcribing..."})
        original = transcribe_audio(file_path)
        print(f"  Transcribed: {original[:100]}...")

        emit("progress", {"step": "translating", "message": "Translating..."})
        translated = translate_text(original, target_language)
        print(f"  Translated: {translated[:100]}...")

        emit("progress", {"step": "generating", "message": "Generating audio..."})
        emit("streaming_started", {"text": translated})

        success = stream_audio_chunks(translated, session_id)
        if success:
            emit("streaming_complete", {"message": "Complete!"})
            print("  ✓ Done!")

    except Exception as e:
        print(f"Error: {e}")
        emit("error", {"message": str(e)})


if __name__ == "__main__":
    print("=" * 70)
    print("Real-time Streaming Translation")
    print("=" * 70)
    load_voice_model_id()

    audio_files = get_available_audio_files()
    print(f"\n✓ Found {len(audio_files)} file(s)")
    for f in audio_files:
        print(f"  - {f}")

    print("\n" + "=" * 70)
    print("Server: http://localhost:5001")
    print("=" * 70 + "\n")

    socketio.run(app, debug=True, host="0.0.0.0", port=5001, allow_unsafe_werkzeug=True)

"""
Real-time Streaming Translation - Continuous Looping
Original audio loops continuously until translation is ready
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
    try:
        from flask import render_template

        return render_template("realtime.html", audio_files=audio_files)
    except:
        options = "".join([f'<option value="{f}">{f}</option>' for f in audio_files])
        return f"""<!DOCTYPE html><html><head><title>Audio Translation - Continuous Loop</title>
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
<style>
body{{font-family:Arial;padding:40px;background:linear-gradient(135deg,#667eea,#764ba2);margin:0}}
.container{{max-width:700px;margin:0 auto;background:white;padding:40px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3)}}
h1{{color:#667eea;margin:0 0 10px;font-size:2em}}
.subtitle{{color:#666;margin-bottom:30px}}
select{{padding:12px;margin:10px 0;width:100%;border:2px solid #ddd;border-radius:8px;font-size:1em}}
.toggle-section{{text-align:center;margin:30px 0;padding:30px;background:#f8f9fa;border-radius:15px}}
.toggle-container{{display:inline-flex;align-items:center;gap:20px}}
.toggle-label{{font-size:1.2em;font-weight:700;color:#666;min-width:100px}}
.toggle-label.active{{color:#667eea}}
.switch{{position:relative;width:80px;height:40px}}
.switch input{{opacity:0;width:0;height:0}}
.slider{{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:0.4s;border-radius:40px}}
.slider:before{{position:absolute;content:"";height:32px;width:32px;left:4px;bottom:4px;background:white;transition:0.4s;border-radius:50%}}
input:checked+.slider{{background:linear-gradient(135deg,#667eea,#764ba2)}}
input:checked+.slider:before{{transform:translateX(40px)}}
input:disabled+.slider{{opacity:0.5;cursor:not-allowed}}
#status{{text-align:center;padding:20px;font-size:1.1em;color:#667eea;font-weight:600;min-height:60px}}
.progress{{width:100%;height:6px;background:#e0e0e0;border-radius:10px;overflow:hidden;margin:20px 0;display:none}}
.progress.active{{display:block}}
.progress-bar{{height:100%;background:linear-gradient(90deg,#667eea,#764ba2);width:0%;transition:width 0.3s}}
.loop-indicator{{text-align:center;color:#667eea;font-weight:600;display:none}}
.loop-indicator.active{{display:block}}
</style></head><body>
<div class="container">
<h1>🎙️ Real-time Translation</h1>
<p class="subtitle">Original loops continuously until translation ready</p>
<select id="audio-select"><option value="">-- Select Audio --</option>{options}</select>
<select id="lang"><option>Spanish</option><option>French</option><option>German</option><option>Italian</option><option>Hindi</option></select>
<div class="toggle-section"><div class="toggle-container">
<span class="toggle-label active" id="orig-label">Original</span>
<label class="switch"><input type="checkbox" id="toggle" disabled><span class="slider"></span></label>
<span class="toggle-label" id="trans-label">Translated</span>
</div></div>
<div class="loop-indicator" id="loop-indicator">🔄 Looping original audio...</div>
<div class="progress" id="progress"><div class="progress-bar" id="progress-bar"></div></div>
<p id="status">Select an audio file to begin</p>
<audio id="orig"></audio>
<audio id="trans"></audio>
</div>
<script>
const socket=io();
let file=null,lang='Spanish',isTranslated=false,isProcessing=false,audioChunks=[];
const origAudio=document.getElementById('orig');
const transAudio=document.getElementById('trans');
const audioSelect=document.getElementById('audio-select');
const langSelect=document.getElementById('lang');
const toggle=document.getElementById('toggle');
const status=document.getElementById('status');
const progress=document.getElementById('progress');
const progressBar=document.getElementById('progress-bar');
const loopIndicator=document.getElementById('loop-indicator');
const origLabel=document.getElementById('orig-label');
const transLabel=document.getElementById('trans-label');

// Enable looping on original audio
origAudio.loop = true;
transAudio.loop = false;

socket.on('connect',()=>console.log('Connected'));
socket.on('progress',(data)=>{{
    progress.classList.add('active');
    status.textContent=data.message;
    if(data.step==='transcribing')progressBar.style.width='33%';
    else if(data.step==='translating')progressBar.style.width='66%';
    else if(data.step==='generating')progressBar.style.width='90%';
}});
socket.on('streaming_started',()=>{{
    progressBar.style.width='100%';
    status.textContent='Translation ready! Switching audio...';
}});
socket.on('audio_chunk',(data)=>{{
    const binary=atob(data.chunk);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    audioChunks.push(bytes);
    if(data.is_final)playTranslated();
}});
socket.on('streaming_complete',()=>{{
    progress.classList.remove('active');
    status.textContent='✓ Playing translated audio in your voice!';
    isProcessing=false;
}});
socket.on('error',(data)=>{{
    status.textContent='❌ '+data.message;
    progress.classList.remove('active');
    isProcessing=false;
    if(isTranslated){{
        toggle.checked=false;
        isTranslated=false;
        playOriginal();
    }}
}});

audioSelect.addEventListener('change',(e)=>{{
    file=e.target.value;
    if(file){{
        toggle.disabled=false;
        toggle.checked=false;
        isTranslated=false;
        playOriginal();
        updateLabels();
    }}else{{
        toggle.disabled=true;
        stopAll();
        status.textContent='Select an audio file';
    }}
}});

langSelect.addEventListener('change',(e)=>{{
    lang=e.target.value;
    if(isTranslated&&file)startTranslation();
}});

toggle.addEventListener('change',(e)=>{{
    if(!file){{e.target.checked=false;return;}}
    isTranslated=e.target.checked;
    updateLabels();
    if(isTranslated){{
        // Keep playing original while translating
        loopIndicator.classList.add('active');
        if(!origAudio.paused){{
            // Original is already playing, just start translation
            startTranslation();
        }}else{{
            // Start playing original first
            playOriginal();
            startTranslation();
        }}
    }}else{{
        loopIndicator.classList.remove('active');
        transAudio.pause();
        transAudio.currentTime=0;
        if(origAudio.paused)playOriginal();
        status.textContent='Playing original audio';
    }}
}});

function playOriginal(){{
    origAudio.src='/api/original-audio/'+file;
    origAudio.loop=true;
    origAudio.load();
    origAudio.play();
    status.textContent='🎵 Playing original (looping)';
    progress.classList.remove('active');
    loopIndicator.classList.remove('active');
}}

function startTranslation(){{
    if(isProcessing)return;
    isProcessing=true;
    audioChunks=[];
    status.textContent='Processing translation (original still playing)...';
    progress.classList.add('active');
    progressBar.style.width='10%';
    socket.emit('start_translation',{{filename:file,target_language:lang}});
}}

function playTranslated(){{
    // Smoothly transition from original to translated
    const blob=new Blob(audioChunks,{{type:'audio/mpeg'}});
    const url=URL.createObjectURL(blob);
    
    // Fade out original and play translated
    loopIndicator.classList.remove('active');
    origAudio.pause();
    origAudio.loop=false;
    
    transAudio.src=url;
    transAudio.loop=true; // Loop translated audio too
    transAudio.load();
    transAudio.play();
    
    transAudio.onended=()=>URL.revokeObjectURL(url);
}}

function stopAll(){{
    origAudio.pause();
    origAudio.currentTime=0;
    transAudio.pause();
    transAudio.currentTime=0;
    loopIndicator.classList.remove('active');
}}

function updateLabels(){{
    if(isTranslated){{
        origLabel.classList.remove('active');
        transLabel.classList.add('active');
    }}else{{
        origLabel.classList.add('active');
        transLabel.classList.remove('active');
    }}
}}
</script></body></html>"""


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
        emit(
            "progress",
            {
                "step": "transcribing",
                "message": "Transcribing (original still playing)...",
            },
        )
        original = transcribe_audio(file_path)
        print(f"  Transcribed: {original[:100]}...")

        emit(
            "progress",
            {
                "step": "translating",
                "message": "Translating (original still playing)...",
            },
        )
        translated = translate_text(original, target_language)
        print(f"  Translated: {translated[:100]}...")

        emit(
            "progress",
            {
                "step": "generating",
                "message": "Generating speech (original still playing)...",
            },
        )
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
    print("Real-time Translation - Continuous Loop Mode")
    print("=" * 70)
    load_voice_model_id()

    audio_files = get_available_audio_files()
    print(f"\n✓ Found {len(audio_files)} file(s)")
    for f in audio_files:
        print(f"  - {f}")

    print("\n" + "=" * 70)
    print("Server: http://localhost:5001")
    print("Original audio loops continuously during translation!")
    print("=" * 70 + "\n")

    socketio.run(app, debug=True, host="0.0.0.0", port=5001, allow_unsafe_werkzeug=True)

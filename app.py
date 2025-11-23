"""
Real-time Audio Translation Web Server
Flask server that handles real-time audio translation with toggle
"""

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import os
import io
import tempfile
from openai import OpenAI
import requests
from config import (
    OPENAI_API_KEY,
    FISH_AUDIO_API_KEY,
    FISH_AUDIO_BASE_URL,
    VOICE_SAMPLES_DIR,
)

app = Flask(__name__)
CORS(app)

# Cache for translations to avoid re-translating
translation_cache = {}
voice_model_id = None


def load_voice_model_id():
    """Load voice model ID from file."""
    global voice_model_id
    if os.path.exists("voice_model_id.txt"):
        with open("voice_model_id.txt", "r") as f:
            voice_model_id = f.read().strip()
            print(f"✓ Loaded voice model: {voice_model_id}")
    else:
        print("⚠️  No voice model found, will use generic voice")


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
    # Check cache
    cache_key = f"{text[:100]}_{target_language}"
    if cache_key in translation_cache:
        print(f"Using cached translation for {target_language}")
        return translation_cache[cache_key]

    client = OpenAI(api_key=OPENAI_API_KEY)

    system_prompt = f"You are a professional translator. Translate the following text to {target_language}. Maintain the tone and meaning accurately."

    response = client.chat.completions.create(
        model="gpt-5-nano",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
    )

    translated = response.choices[0].message.content
    translation_cache[cache_key] = translated

    return translated


def generate_speech(text, target_language):
    """Generate speech using Fish Audio TTS."""
    url = f"{FISH_AUDIO_BASE_URL}/v1/tts"

    headers = {
        "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
        "Content-Type": "application/json",
    }

    data = {
        "text": text,
        "format": "mp3",
        "latency": "balanced",  # Use balanced for faster response
        "mp3_bitrate": 128,
    }

    # Use voice model if available
    if voice_model_id:
        data["reference_id"] = voice_model_id

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"TTS Error: {response.status_code} - {response.text}")


@app.route("/")
def index():
    """Render main page."""
    audio_files = get_available_audio_files()
    return render_template("index.html", audio_files=audio_files)


@app.route("/api/audio-files")
def get_audio_files():
    """API endpoint to get available audio files."""
    files = get_available_audio_files()
    return jsonify({"files": files})


@app.route("/api/original-audio/<filename>")
def serve_original_audio(filename):
    """Serve original audio file."""
    file_path = os.path.join(VOICE_SAMPLES_DIR, filename)
    if os.path.exists(file_path):
        return send_file(file_path, mimetype="audio/mpeg")
    return jsonify({"error": "File not found"}), 404


@app.route("/api/translate", methods=["POST"])
def translate_audio():
    """
    Translate audio endpoint.
    Expects: { filename: str, target_language: str }
    Returns: Translated audio file
    """
    data = request.json
    filename = data.get("filename")
    target_language = data.get("target_language", "Spanish")

    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    file_path = os.path.join(VOICE_SAMPLES_DIR, filename)

    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404

    try:
        print(f"Processing: {filename} -> {target_language}")

        # Step 1: Transcribe
        print("  Transcribing...")
        original_text = transcribe_audio(file_path)
        print(f"  Original: {original_text[:100]}...")

        # Step 2: Translate
        print("  Translating...")
        translated_text = translate_text(original_text, target_language)
        print(f"  Translated: {translated_text[:100]}...")

        # Step 3: Generate Speech
        print("  Generating speech...")
        audio_data = generate_speech(translated_text, target_language)
        print("  ✓ Complete!")

        # Return audio as response
        return send_file(
            io.BytesIO(audio_data),
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name=f"{os.path.splitext(filename)[0]}_{target_language.lower()}.mp3",
        )

    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/languages")
def get_languages():
    """Get list of supported languages."""
    languages = [
        "Spanish",
        "French",
        "German",
        "Italian",
        "Portuguese",
        "Chinese",
        "Japanese",
        "Korean",
        "Arabic",
        "Hindi",
        "Russian",
        "Turkish",
        "Dutch",
        "Polish",
        "Swedish",
    ]
    return jsonify({"languages": languages})


if __name__ == "__main__":
    print("=" * 70)
    print("Real-time Audio Translation Server")
    print("=" * 70)

    # Load voice model
    load_voice_model_id()

    # Check for audio files
    audio_files = get_available_audio_files()
    print(f"\n✓ Found {len(audio_files)} audio file(s) in {VOICE_SAMPLES_DIR}")
    for f in audio_files:
        print(f"  - {f}")

    print("\n" + "=" * 70)
    print("Starting server at http://localhost:5000")
    print("=" * 70)
    print()

    app.run(debug=True, port=5000, threaded=True)

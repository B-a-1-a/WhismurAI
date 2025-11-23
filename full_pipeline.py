"""
Full Pipeline: Audio Translation with Voice Cloning
This script runs the complete workflow:
1. Transcribe audio → text
2. Translate text → target language
3. Generate speech with Fish Audio (optionally using your cloned voice)

Note: Voice cloning (step 1_clone_voice.py) should be run separately first
if you want to use your own voice.
"""

import os
from openai import OpenAI
import requests
from config import (
    OPENAI_API_KEY,
    FISH_AUDIO_API_KEY,
    FISH_AUDIO_BASE_URL,
    INPUT_AUDIO_DIR,
    OUTPUT_AUDIO_DIR,
)


def transcribe_audio(audio_file_path, language=None):
    """Transcribe audio to text using OpenAI Whisper."""
    client = OpenAI(api_key=OPENAI_API_KEY)

    print("Step 1/3: Transcribing audio...")

    with open(audio_file_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1", file=audio_file, language=language
        )

    return transcript.text


def translate_text(text, target_language, source_language=None):
    """Translate text using GPT-5 nano."""
    client = OpenAI(api_key=OPENAI_API_KEY)

    print(f"Step 2/3: Translating to {target_language}...")
    print("Using model: gpt-5-nano")

    if source_language:
        system_prompt = f"You are a professional translator. Translate the following text from {source_language} to {target_language}. Maintain the tone and meaning accurately."
    else:
        system_prompt = f"You are a professional translator. Translate the following text to {target_language}. Maintain the tone and meaning accurately."

    response = client.chat.completions.create(
        model="gpt-5-nano",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        # Note: gpt-5-nano only supports default temperature (1)
    )

    return response.choices[0].message.content


def generate_speech(text, output_path, reference_id=None, format="mp3", backend="s1"):
    """Generate speech using Fish Audio TTS."""
    url = f"{FISH_AUDIO_BASE_URL}/v1/tts"

    print("Step 3/3: Generating speech...")
    print(f"Using Fish Audio model: {backend}")

    headers = {
        "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
        "Content-Type": "application/json",
    }

    data = {
        "text": text,
        "format": format,
        "latency": "normal",
        "backend": backend,  # Specify which model to use
    }

    if reference_id:
        data["reference_id"] = reference_id

    if format == "mp3":
        data["mp3_bitrate"] = 128

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
        return output_path
    else:
        raise Exception(
            f"Error generating speech: {response.status_code}\n{response.text}"
        )


def load_voice_model_id():
    """Load voice model ID from file if it exists."""
    if os.path.exists("voice_model_id.txt"):
        with open("voice_model_id.txt", "r") as f:
            return f.read().strip()
    return None


def process_audio_translation(
    audio_file_path,
    target_language,
    source_language=None,
    voice_model_id=None,
    output_format="mp3",
    fish_audio_backend="s1",
):
    """
    Complete pipeline: transcribe → translate → generate speech.

    Args:
        audio_file_path (str): Path to input audio file
        target_language (str): Target language for translation
        source_language (str, optional): Source language
        voice_model_id (str, optional): Voice model ID for cloning
        output_format (str): Output audio format
        fish_audio_backend (str): Fish Audio model backend

    Returns:
        dict: Results including transcription, translation, and audio file path
    """
    print("=" * 60)
    print("AUDIO TRANSLATION PIPELINE")
    print("=" * 60)
    print(f"Input: {audio_file_path}")
    print(f"Target Language: {target_language}")
    print(f"Translation Model: gpt-5-nano")
    print(f"Fish Audio Model: {fish_audio_backend}")
    if voice_model_id:
        print(f"Voice Model: {voice_model_id}")
    print("=" * 60 + "\n")

    # Step 1: Transcribe
    original_text = transcribe_audio(audio_file_path, source_language)
    print(f"✓ Original text: {original_text[:100]}...\n")

    # Step 2: Translate
    translated_text = translate_text(original_text, target_language, source_language)
    print(f"✓ Translated text: {translated_text[:100]}...\n")

    # Step 3: Generate speech
    base_name = os.path.splitext(os.path.basename(audio_file_path))[0]
    output_filename = (
        f"translated_{target_language.lower()}_{base_name}.{output_format}"
    )
    output_path = os.path.join(OUTPUT_AUDIO_DIR, output_filename)

    audio_file = generate_speech(
        translated_text, output_path, voice_model_id, output_format, fish_audio_backend
    )
    print(f"✓ Audio generated: {audio_file}\n")

    # Save intermediate files
    transcription_file = f"transcription_{base_name}.txt"
    translation_file = f"translation_{target_language.lower()}_{base_name}.txt"

    with open(transcription_file, "w", encoding="utf-8") as f:
        f.write(original_text)

    with open(translation_file, "w", encoding="utf-8") as f:
        f.write(translated_text)

    return {
        "original_text": original_text,
        "translated_text": translated_text,
        "audio_file": audio_file,
        "transcription_file": transcription_file,
        "translation_file": translation_file,
    }


if __name__ == "__main__":
    print("=" * 60)
    print("FULL AUDIO TRANSLATION PIPELINE")
    print("=" * 60)

    # Find audio files
    if not os.path.exists(INPUT_AUDIO_DIR):
        print(f"\n❌ Error: Input directory not found: {INPUT_AUDIO_DIR}")
        exit(1)

    audio_files = [
        f
        for f in os.listdir(INPUT_AUDIO_DIR)
        if f.endswith((".mp3", ".wav", ".m4a", ".flac", ".webm"))
    ]

    if not audio_files:
        print(f"\n❌ No audio files found in {INPUT_AUDIO_DIR}")
        print("Please add an audio file to process.")
        exit(1)

    print(f"\nFound {len(audio_files)} audio file(s):")
    for idx, filename in enumerate(audio_files, 1):
        print(f"  {idx}. {filename}")

    # Select file
    if len(audio_files) == 1:
        selected_file = audio_files[0]
        print(f"\nUsing: {selected_file}")
    else:
        selection = input("\nSelect file number (or press Enter for #1): ").strip()
        idx = int(selection) - 1 if selection else 0
        selected_file = audio_files[idx]

    audio_path = os.path.join(INPUT_AUDIO_DIR, selected_file)

    # Get languages
    print("\nSource language (leave empty for auto-detect):")
    source_lang = input("Language code (en, es, fr, etc.): ").strip() or None

    print("\nTarget language:")
    print("  Spanish, French, German, Italian, Portuguese,")
    print("  Chinese, Japanese, Korean, Arabic, Hindi, etc.")
    target_lang = input("Target language: ").strip()
    if not target_lang:
        print("❌ Target language is required")
        exit(1)

    # Check for voice model
    saved_model_id = load_voice_model_id()
    if saved_model_id:
        print(f"\n✓ Found saved voice model ID: {saved_model_id}")
        use_model = input("Use this voice model? (y/n, default: y): ").strip().lower()
        if use_model in ["", "y", "yes"]:
            voice_model_id = saved_model_id
        else:
            voice_model_id = (
                input("Enter voice model ID (or leave empty): ").strip() or None
            )
    else:
        voice_model_id = (
            input("\nVoice model ID (leave empty for generic voice): ").strip() or None
        )

    # Audio format
    print("\nOutput audio format (mp3, wav, opus):")
    audio_format = input("Format (default: mp3): ").strip().lower() or "mp3"

    # Fish Audio model selection
    print("\nFish Audio TTS Model:")
    print("  1. s1 (OpenAudio S1 - latest, best quality)")
    print("  2. speech-1.5")
    print("  3. speech-1.4")
    fish_choice = input("Select (default: 1): ").strip() or "1"
    fish_models = {"1": "s1", "2": "speech-1.5", "3": "speech-1.4"}
    selected_fish_model = fish_models.get(fish_choice, "s1")

    try:
        # Run full pipeline
        result = process_audio_translation(
            audio_file_path=audio_path,
            target_language=target_lang,
            source_language=source_lang,
            voice_model_id=voice_model_id,
            output_format=audio_format,
            fish_audio_backend=selected_fish_model,
        )

        # Print results
        print("\n" + "=" * 60)
        print("✓ PIPELINE COMPLETE!")
        print("=" * 60)
        print(f"\nOriginal text saved to: {result['transcription_file']}")
        print(f"Translated text saved to: {result['translation_file']}")
        print(f"Audio saved to: {result['audio_file']}")
        print(
            f"\nAudio file size: {os.path.getsize(result['audio_file']) / 1024:.2f} KB"
        )
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()

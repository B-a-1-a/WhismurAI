#!/usr/bin/env python3
"""
Automated Audio Translation - One Command
Uses your existing pipeline scripts to automate the entire workflow.

Usage:
    python automate.py <audio_file> <target_language>

Example:
    python automate.py my_recording.mp3 Spanish
    python automate.py input_audio/speech.wav Hindi

This script will:
1. Check/create voice clone (using 1_clone_voice.py)
2. Transcribe audio (using 2_transcribe.py)
3. Translate text (using 3_translate.py)
4. Generate speech (using 4_generate_speech.py)
"""

import os
import sys


def check_file_exists(filepath):
    """Check if a file exists."""
    if not os.path.exists(filepath):
        print(f"❌ Error: Required file not found: {filepath}")
        sys.exit(1)


def run_voice_clone():
    """Run voice cloning if needed."""
    # Check if voice model already exists
    if os.path.exists("voice_model_id.txt"):
        with open("voice_model_id.txt", "r") as f:
            model_id = f.read().strip()
            if model_id:
                print(f"✓ Using existing voice model: {model_id}\n")
                return True

    # Check if voice samples exist
    voice_samples_dir = "./voice_samples"
    if not os.path.exists(voice_samples_dir):
        print(f"⚠️  No voice_samples directory found")
        print("Will use generic voice for output.\n")
        return False

    audio_files = [
        f
        for f in os.listdir(voice_samples_dir)
        if f.endswith((".mp3", ".wav", ".flac"))
    ]

    if not audio_files:
        print(f"⚠️  No voice samples found in {voice_samples_dir}")
        print("Will use generic voice for output.\n")
        return False

    print(f"🎙️  Found {len(audio_files)} voice sample(s)")
    print("Creating voice clone...\n")

    # Import and run voice clone function
    import importlib

    clone_module = importlib.import_module("1_clone_voice")

    try:
        model_id = clone_module.create_voice_clone(
            model_name="Automated Voice Clone",
            description="Auto-created for translation pipeline",
        )
        print(f"✓ Voice clone created successfully!\n")
        return True
    except Exception as e:
        print(f"⚠️  Voice clone failed: {e}")
        print("Will use generic voice for output.\n")
        return False


def transcribe_audio(audio_file):
    """Transcribe audio using 2_transcribe.py."""
    import importlib

    transcribe_module = importlib.import_module("2_transcribe")

    print("Step 1/3: Transcribing audio...")

    text = transcribe_module.transcribe_audio(audio_file)

    # Save transcription
    base_name = os.path.splitext(os.path.basename(audio_file))[0]
    transcript_file = f"transcription_{base_name}.txt"
    transcribe_module.save_transcription(text, transcript_file)

    print(f"✓ Transcribed: {text[:100]}...")
    print(f"  Saved to: {transcript_file}\n")

    return transcript_file


def translate_text(transcript_file, target_language):
    """Translate text using 3_translate.py."""
    import importlib

    translate_module = importlib.import_module("3_translate")

    print(f"Step 2/3: Translating to {target_language}...")

    # Load transcript
    original_text = translate_module.load_text_file(transcript_file)

    # Translate
    translated_text = translate_module.translate_text(original_text, target_language)

    # Save translation
    base_name = os.path.splitext(os.path.basename(transcript_file))[0].replace(
        "transcription_", ""
    )
    translation_file = f"translation_{target_language.lower()}_{base_name}.txt"
    translate_module.save_translation(translated_text, translation_file)

    print(f"✓ Translated: {translated_text[:100]}...")
    print(f"  Saved to: {translation_file}\n")

    return translation_file


def generate_speech(translation_file):
    """Generate speech using 4_generate_speech.py."""
    import importlib

    generate_module = importlib.import_module("4_generate_speech")
    from config import OUTPUT_AUDIO_DIR

    print("Step 3/3: Generating speech with Fish Audio...")

    # Load translation
    text = generate_module.load_text_file(translation_file)

    # Get voice model ID if it exists
    voice_model_id = generate_module.load_voice_model_id()

    if voice_model_id:
        print(f"  Using your cloned voice: {voice_model_id}")
    else:
        print("  Using generic voice")

    # Generate output filename
    base_name = (
        os.path.splitext(os.path.basename(translation_file))[0]
        .replace("translation_", "")
        .replace("_transcription", "")
    )
    output_filename = f"speech_{base_name}.mp3"
    output_path = os.path.join(OUTPUT_AUDIO_DIR, output_filename)

    # Generate speech (compatible with both old and new versions)
    try:
        # Try with backend parameter (new version)
        result_path = generate_module.generate_speech(
            text=text,
            output_path=output_path,
            reference_id=voice_model_id,
            format="mp3",
            latency="normal",
            chunk_length=200,
            backend="s1",
        )
    except TypeError:
        # Fall back without backend parameter (old version)
        result_path = generate_module.generate_speech(
            text=text,
            output_path=output_path,
            reference_id=voice_model_id,
            format="mp3",
            latency="normal",
            chunk_length=200,
        )

    print(f"✓ Audio generated!")
    print(f"  Saved to: {result_path}\n")

    return result_path


def main():
    print("=" * 70)
    print("AUTOMATED AUDIO TRANSLATION PIPELINE")
    print("=" * 70)
    print()

    # Check arguments
    if len(sys.argv) < 3:
        print("Usage: python automate.py <audio_file> <target_language>")
        print("\nExamples:")
        print("  python automate.py my_recording.mp3 Spanish")
        print("  python automate.py input_audio/speech.wav Hindi")
        print("  python automate.py ../audio.mp3 French")
        print("\nSupported languages:")
        print("  Spanish, French, German, Italian, Portuguese,")
        print("  Chinese, Japanese, Korean, Arabic, Hindi, etc.")
        sys.exit(1)

    audio_file = sys.argv[1]
    target_language = sys.argv[2]

    # Check if file exists
    if not os.path.exists(audio_file):
        # Try looking in input_audio directory
        from config import INPUT_AUDIO_DIR

        alt_path = os.path.join(INPUT_AUDIO_DIR, audio_file)
        if os.path.exists(alt_path):
            audio_file = alt_path
        else:
            print(f"❌ Error: Audio file not found: {audio_file}")
            print(f"Also checked: {alt_path}")
            sys.exit(1)

    print(f"📁 Input file: {audio_file}")
    print(f"🌐 Target language: {target_language}")
    print()

    # Check required files
    required_files = [
        "config.py",
        "1_clone_voice.py",
        "2_transcribe.py",
        "3_translate.py",
        "4_generate_speech.py",
    ]
    for file in required_files:
        check_file_exists(file)

    try:
        # Step 0: Check/create voice clone
        print("=" * 70)
        print("SETUP: Checking Voice Clone")
        print("=" * 70)
        run_voice_clone()

        # Step 1: Transcribe
        print("=" * 70)
        print("STEP 1: Transcription")
        print("=" * 70)
        transcript_file = transcribe_audio(audio_file)

        # Step 2: Translate
        print("=" * 70)
        print("STEP 2: Translation")
        print("=" * 70)
        translation_file = translate_text(transcript_file, target_language)

        # Step 3: Generate Speech
        print("=" * 70)
        print("STEP 3: Speech Generation")
        print("=" * 70)
        audio_output = generate_speech(translation_file)

        # Final summary
        print("=" * 70)
        print("✅ PIPELINE COMPLETE!")
        print("=" * 70)
        print(f"\n📄 Files created:")
        print(f"  • Original transcript: {transcript_file}")
        print(f"  • Translation: {translation_file}")
        print(f"  • Audio output: {audio_output}")
        print(f"\n📊 Audio file size: {os.path.getsize(audio_output) / 1024:.2f} KB")
        print("\n" + "=" * 70)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

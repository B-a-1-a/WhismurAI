"""
Step 2: Transcribe Audio to Text
This script uses OpenAI Whisper to convert your audio recording to text.

Requirements:
- Place your audio file in ./input_audio/
- Supported formats: .mp3, .wav, .m4a, .flac, .webm
"""

import os
from openai import OpenAI
from config import OPENAI_API_KEY, INPUT_AUDIO_DIR


def transcribe_audio(audio_file_path, language=None):
    """
    Transcribe audio to text using OpenAI Whisper.
    
    Args:
        audio_file_path (str): Path to the audio file
        language (str, optional): ISO language code (e.g., 'en', 'es', 'fr')
                                 If None, Whisper will auto-detect
    
    Returns:
        str: Transcribed text
    """
    if not os.path.exists(audio_file_path):
        raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
    
    client = OpenAI(api_key=OPENAI_API_KEY)
    
    print(f"Transcribing: {audio_file_path}")
    print("This may take a moment...\n")
    
    with open(audio_file_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language  # Optional: specify source language
        )
    
    return transcript.text


def save_transcription(text, output_file):
    """Save transcription to a text file."""
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Transcription saved to: {output_file}")


if __name__ == "__main__":
    print("=" * 60)
    print("Audio Transcription (Whisper)")
    print("=" * 60)
    
    # Check for audio files in input directory
    if not os.path.exists(INPUT_AUDIO_DIR):
        print(f"\n❌ Error: Input directory not found: {INPUT_AUDIO_DIR}")
        exit(1)
    
    audio_files = [f for f in os.listdir(INPUT_AUDIO_DIR) 
                   if f.endswith(('.mp3', '.wav', '.m4a', '.flac', '.webm'))]
    
    if not audio_files:
        print(f"\n❌ No audio files found in {INPUT_AUDIO_DIR}")
        print("Please add an audio file to transcribe.")
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
    
    # Optional: specify source language
    print("\nSource language (leave empty for auto-detect):")
    print("  en = English, es = Spanish, fr = French, de = German, etc.")
    source_lang = input("Language code: ").strip() or None
    
    try:
        # Transcribe
        text = transcribe_audio(audio_path, language=source_lang)
        
        print("\n" + "=" * 60)
        print("TRANSCRIPTION:")
        print("=" * 60)
        print(text)
        print("=" * 60)
        
        # Save to file
        base_name = os.path.splitext(selected_file)[0]
        output_file = f"transcription_{base_name}.txt"
        save_transcription(text, output_file)
        
        print(f"\n✓ Transcription complete!")
        print(f"Text saved to: {output_file}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")

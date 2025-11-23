"""
Step 4: Generate Speech with Fish Audio
This script generates speech from your translated text using Fish Audio TTS.

Requirements:
- A text file to convert to speech (from step 3 or your own)
- Optional: Voice model ID from step 1 (for voice cloning)
"""

import os
import requests
from config import (
    FISH_AUDIO_API_KEY, 
    FISH_AUDIO_BASE_URL, 
    OUTPUT_AUDIO_DIR,
    DEFAULT_AUDIO_FORMAT
)


def generate_speech(text, output_path, reference_id=None, format="mp3", 
                   latency="normal", chunk_length=200):
    """
    Generate speech from text using Fish Audio TTS.
    
    Args:
        text (str): Text to convert to speech
        output_path (str): Where to save the audio file
        reference_id (str, optional): Your voice model ID (from step 1)
        format (str): Audio format - 'mp3', 'wav', 'pcm', 'opus'
        latency (str): 'normal' or 'balanced' (balanced is faster)
        chunk_length (int): Text chunk length for processing
    
    Returns:
        str: Path to the generated audio file
    """
    url = f"{FISH_AUDIO_BASE_URL}/v1/tts"
    
    headers = {
        "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {
        "text": text,
        "format": format,
        "latency": latency,
        "chunk_length": chunk_length
    }
    
    # Add reference_id only if provided (for voice cloning)
    if reference_id:
        data["reference_id"] = reference_id
        print(f"Using voice model: {reference_id}")
    else:
        print("Using generic voice (no voice cloning)")
    
    # Optional: specify mp3 bitrate
    if format == "mp3":
        data["mp3_bitrate"] = 128
    
    print(f"\nGenerating speech...")
    print(f"Format: {format}")
    print(f"Latency: {latency}")
    print("This may take a moment...\n")
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
        print(f"✓ Audio generated successfully!")
        return output_path
    else:
        raise Exception(f"Error generating speech: {response.status_code}\n{response.text}")


def load_text_file(file_path):
    """Load text from a file."""
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def load_voice_model_id():
    """Load voice model ID from file if it exists."""
    if os.path.exists("voice_model_id.txt"):
        with open("voice_model_id.txt", "r") as f:
            return f.read().strip()
    return None


if __name__ == "__main__":
    print("=" * 60)
    print("Fish Audio Text-to-Speech")
    print("=" * 60)
    
    # Find translation files
    text_files = [f for f in os.listdir(".") 
                  if f.endswith('.txt') and (f.startswith('translation_') or f.startswith('transcription_'))]
    
    if text_files:
        print(f"\nFound {len(text_files)} text file(s):")
        for idx, filename in enumerate(text_files, 1):
            print(f"  {idx}. {filename}")
        
        if len(text_files) == 1:
            selected_file = text_files[0]
            print(f"\nUsing: {selected_file}")
        else:
            selection = input("\nSelect file number (or press Enter for #1): ").strip()
            idx = int(selection) - 1 if selection else 0
            selected_file = text_files[idx]
    else:
        print("\nNo text files found.")
        text_file_path = input("Enter path to text file: ").strip()
        if not os.path.exists(text_file_path):
            print(f"❌ File not found: {text_file_path}")
            exit(1)
        selected_file = text_file_path
    
    # Load text
    try:
        text = load_text_file(selected_file)
        print(f"\n{'=' * 60}")
        print("TEXT TO CONVERT:")
        print("=" * 60)
        print(text[:300] + ("..." if len(text) > 300 else ""))
        print("=" * 60)
    except Exception as e:
        print(f"❌ Error loading file: {e}")
        exit(1)
    
    # Check for voice model
    saved_model_id = load_voice_model_id()
    if saved_model_id:
        print(f"\n✓ Found saved voice model ID: {saved_model_id}")
        use_model = input("Use this voice model? (y/n, default: y): ").strip().lower()
        if use_model in ['', 'y', 'yes']:
            voice_model_id = saved_model_id
        else:
            voice_model_id = input("Enter voice model ID (or leave empty for generic voice): ").strip() or None
    else:
        print("\nNo saved voice model found.")
        voice_model_id = input("Enter voice model ID (or leave empty for generic voice): ").strip() or None
    
    # Audio format
    print("\nAudio format options: mp3 (default), wav, opus")
    audio_format = input("Format: ").strip().lower() or "mp3"
    
    # Generate output filename
    base_name = os.path.splitext(os.path.basename(selected_file))[0]
    output_filename = f"speech_{base_name}.{audio_format}"
    output_path = os.path.join(OUTPUT_AUDIO_DIR, output_filename)
    
    try:
        # Generate speech
        result_path = generate_speech(
            text=text,
            output_path=output_path,
            reference_id=voice_model_id,
            format=audio_format
        )
        
        print(f"\n{'=' * 60}")
        print("SUCCESS!")
        print("=" * 60)
        print(f"Audio saved to: {result_path}")
        print(f"File size: {os.path.getsize(result_path) / 1024:.2f} KB")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")

"""
Step 1: Clone Your Voice
This script uploads your voice samples to Fish Audio and creates a voice clone model.

Requirements:
- Place 3-5 minutes of clean voice recordings in ./voice_samples/
- Supported formats: .mp3, .wav, .flac
- Use clear recordings without background noise
"""

import os
import requests
from config import FISH_AUDIO_API_KEY, FISH_AUDIO_BASE_URL, VOICE_SAMPLES_DIR


def create_voice_clone(model_name, description="My voice clone"):
    """
    Create a voice clone from audio samples in the voice_samples directory.

    Args:
        model_name (str): Name for your voice model
        description (str): Description of the voice model

    Returns:
        str: The model ID (reference_id) to use for TTS
    """
    url = f"{FISH_AUDIO_BASE_URL}/model"

    headers = {"Authorization": f"Bearer {FISH_AUDIO_API_KEY}"}

    # Check if voice samples directory exists and has files
    if not os.path.exists(VOICE_SAMPLES_DIR):
        raise Exception(f"Voice samples directory not found: {VOICE_SAMPLES_DIR}")

    audio_files = [
        f
        for f in os.listdir(VOICE_SAMPLES_DIR)
        if f.endswith((".mp3", ".wav", ".flac"))
    ]

    if not audio_files:
        raise Exception(
            f"No audio files found in {VOICE_SAMPLES_DIR}. "
            "Please add .mp3, .wav, or .flac files."
        )

    print(f"Found {len(audio_files)} audio file(s) for voice cloning:")
    for f in audio_files:
        print(f"  - {f}")

    # Prepare files for upload
    files = []
    for filename in audio_files:
        file_path = os.path.join(VOICE_SAMPLES_DIR, filename)
        files.append(("voices", (filename, open(file_path, "rb"), "audio/wav")))

    # Required fields for Fish Audio API
    data = {
        "title": model_name,
        "name": model_name,  # Some APIs use 'name', some use 'title'
        "type": "tts",  # Required: type of model
        "train_mode": "fast",  # Options: 'fast' or 'full'
        "visibility": "private",  # Set to private so no cover image is required
        "description": description,
    }

    print(f"\nUploading voice samples and creating model '{model_name}'...")
    print("Training mode: fast (this may take a few minutes)")
    response = requests.post(url, headers=headers, data=data, files=files)

    # Close all file handles
    for _, file_tuple in files:
        file_tuple[1].close()

    if response.status_code == 200 or response.status_code == 201:
        result = response.json()
        model_id = result.get("id") or result.get("model_id") or result.get("_id")
        print(f"\n✓ Voice clone created successfully!")
        print(f"Model ID: {model_id}")
        print(f"Model Name: {model_name}")
        print(f"\nSave this Model ID - you'll need it for speech generation!")

        # Save model ID to file
        with open("voice_model_id.txt", "w") as f:
            f.write(model_id)
        print(f"Model ID saved to: voice_model_id.txt")

        return model_id
    else:
        raise Exception(
            f"Error creating voice clone: {response.status_code}\n{response.text}"
        )


def list_voice_models():
    """List all your existing voice models."""
    url = f"{FISH_AUDIO_BASE_URL}/model"

    headers = {"Authorization": f"Bearer {FISH_AUDIO_API_KEY}"}

    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        try:
            models = response.json()

            # Handle different response formats
            if isinstance(models, dict):
                # If response is a dict, check for common keys
                if "models" in models:
                    models = models["models"]
                elif "data" in models:
                    models = models["data"]
                else:
                    # Single model returned as dict
                    models = [models]

            if models and len(models) > 0:
                print("\nYour existing voice models:")
                for model in models:
                    if isinstance(model, dict):
                        model_id = (
                            model.get("id") or model.get("model_id") or model.get("_id")
                        )
                        model_name = model.get("name", "Unnamed")
                        print(f"  - {model_name} (ID: {model_id})")
                    elif isinstance(model, str):
                        # If model is just a string (ID), print it
                        print(f"  - Model ID: {model}")
            else:
                print("\nNo voice models found.")
            return models
        except Exception as e:
            print(f"Error parsing models: {e}")
            print(f"Raw response: {response.text[:200]}")
            return []
    else:
        print(f"Error fetching models: {response.status_code}")
        print(f"Response: {response.text}")
        return []


if __name__ == "__main__":
    print("=" * 60)
    print("Fish Audio Voice Cloning")
    print("=" * 60)

    # First, check existing models
    print("\nChecking for existing voice models...")
    list_voice_models()

    # Ask user if they want to create a new model
    print("\n" + "-" * 60)
    create_new = input("Do you want to create a new voice clone? (y/n): ").lower()

    if create_new == "y":
        model_name = input("Enter a name for your voice model: ").strip()
        if not model_name:
            model_name = "My Voice Clone"

        description = input("Enter a description (optional): ").strip()
        if not description:
            description = "Voice clone created via API"

        try:
            model_id = create_voice_clone(model_name, description)
            print(f"\n{'=' * 60}")
            print("SUCCESS! Your voice has been cloned.")
            print(f"Use this Model ID in step 4: {model_id}")
            print(f"{'=' * 60}")
        except Exception as e:
            print(f"\n❌ Error: {e}")
    else:
        print("\nSkipping voice clone creation.")

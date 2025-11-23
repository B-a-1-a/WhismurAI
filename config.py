import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your_openai_api_key_here")
FISH_AUDIO_API_KEY = os.getenv("FISH_AUDIO_API_KEY", "your_fish_audio_api_key_here")

# Directory paths
VOICE_SAMPLES_DIR = "./voice_samples"
INPUT_AUDIO_DIR = "./input_audio"
OUTPUT_AUDIO_DIR = "./output_audio"

# Fish Audio API endpoint
FISH_AUDIO_BASE_URL = "https://api.fish.audio"

# Default settings
DEFAULT_TARGET_LANGUAGE = "Spanish"
DEFAULT_AUDIO_FORMAT = "mp3"

# Create directories if they don't exist
for directory in [VOICE_SAMPLES_DIR, INPUT_AUDIO_DIR, OUTPUT_AUDIO_DIR]:
    os.makedirs(directory, exist_ok=True)

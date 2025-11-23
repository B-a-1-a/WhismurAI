#!/usr/bin/env python3
"""
Setup script for Audio Translation Pipeline
Run this first to set up your environment
"""

import os
import sys

def create_directories():
    """Create necessary directories."""
    directories = [
        "./voice_samples",
        "./input_audio",
        "./output_audio"
    ]
    
    print("Creating directories...")
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        print(f"  ✓ {directory}")

def create_env_file():
    """Create .env file if it doesn't exist."""
    if os.path.exists(".env"):
        print("\n.env file already exists. Skipping...")
        return
    
    print("\nCreating .env file...")
    
    openai_key = input("Enter your OpenAI API key (or press Enter to skip): ").strip()
    fish_key = input("Enter your Fish Audio API key (or press Enter to skip): ").strip()
    
    with open(".env", "w") as f:
        f.write("# API Keys\n")
        f.write(f"OPENAI_API_KEY={openai_key or 'your_openai_api_key_here'}\n")
        f.write(f"FISH_AUDIO_API_KEY={fish_key or 'your_fish_audio_api_key_here'}\n")
    
    print("  ✓ .env file created")
    
    if not openai_key or not fish_key:
        print("\n⚠️  Remember to edit .env and add your API keys!")

def check_dependencies():
    """Check if required packages are installed."""
    print("\nChecking dependencies...")
    
    required = ['openai', 'requests', 'dotenv']
    missing = []
    
    for package in required:
        try:
            __import__(package if package != 'dotenv' else 'dotenv')
            print(f"  ✓ {package}")
        except ImportError:
            print(f"  ✗ {package} (missing)")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  Missing packages: {', '.join(missing)}")
        print("Install them with: pip install -r requirements.txt")
        return False
    
    return True

def print_next_steps():
    """Print next steps for the user."""
    print("\n" + "="*60)
    print("✓ Setup complete!")
    print("="*60)
    print("\nNext steps:")
    print("\n1. Add your API keys to .env file:")
    print("   - OpenAI API key: https://platform.openai.com/api-keys")
    print("   - Fish Audio API key: https://fish.audio/app/api-keys/")
    print("\n2. (Optional) Clone your voice:")
    print("   - Add 3-5 min of voice samples to ./voice_samples/")
    print("   - Run: python 1_clone_voice.py")
    print("\n3. Translate audio:")
    print("   - Add audio file to ./input_audio/")
    print("   - Run: python full_pipeline.py")
    print("\nOr run individual steps:")
    print("   python 2_transcribe.py")
    print("   python 3_translate.py")
    print("   python 4_generate_speech.py")
    print("\n" + "="*60)

def main():
    print("="*60)
    print("Audio Translation Pipeline - Setup")
    print("="*60)
    
    # Create directories
    create_directories()
    
    # Create .env file
    create_env_file()
    
    # Check dependencies
    deps_ok = check_dependencies()
    
    # Print next steps
    print_next_steps()
    
    if not deps_ok:
        print("\n⚠️  Please install missing dependencies first!")
        sys.exit(1)

if __name__ == "__main__":
    main()

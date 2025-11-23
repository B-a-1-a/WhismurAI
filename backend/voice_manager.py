"""
Voice Management Utility for Fish Audio Voice Cloning
Helps create, list, and manage voice clones for translation
"""

import os
import requests
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

class FishAudioVoiceManager:
    """Manage Fish Audio voice clones and references"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("FISH_API_KEY")
        if not self.api_key:
            raise ValueError("FISH_API_KEY not found in environment variables")

        self.base_url = "https://api.fish.audio/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def list_voices(self) -> List[Dict]:
        """
        List all available voice models

        Returns:
            List of voice model dictionaries with id, name, description, etc.
        """
        try:
            response = requests.get(
                f"{self.base_url}/voices",
                headers=self.headers
            )
            response.raise_for_status()
            voices = response.json()

            print(f"\n✅ Found {len(voices)} voice models:")
            for i, voice in enumerate(voices, 1):
                print(f"\n{i}. {voice.get('name', 'Unnamed')}")
                print(f"   ID: {voice.get('id', 'N/A')}")
                print(f"   Description: {voice.get('description', 'No description')}")
                print(f"   Language: {voice.get('language', 'N/A')}")

            return voices

        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching voices: {e}")
            return []

    def get_voice_details(self, voice_id: str) -> Optional[Dict]:
        """
        Get details for a specific voice model

        Args:
            voice_id: The voice model ID

        Returns:
            Voice model details dictionary
        """
        try:
            response = requests.get(
                f"{self.base_url}/voices/{voice_id}",
                headers=self.headers
            )
            response.raise_for_status()
            voice = response.json()

            print(f"\n📋 Voice Details:")
            print(f"   Name: {voice.get('name', 'N/A')}")
            print(f"   ID: {voice.get('id', 'N/A')}")
            print(f"   Language: {voice.get('language', 'N/A')}")
            print(f"   Gender: {voice.get('gender', 'N/A')}")
            print(f"   Description: {voice.get('description', 'N/A')}")

            return voice

        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching voice details: {e}")
            return None

    def create_voice_clone(
        self,
        audio_file_path: str,
        voice_name: str,
        description: str = "",
        language: str = "en"
    ) -> Optional[str]:
        """
        Create a new voice clone from an audio file

        Args:
            audio_file_path: Path to audio file (WAV, MP3, etc.)
            voice_name: Name for the new voice model
            description: Description of the voice
            language: Language code (en, es, fr, etc.)

        Returns:
            Voice ID if successful, None otherwise
        """
        try:
            # Read audio file
            with open(audio_file_path, 'rb') as audio_file:
                files = {
                    'audio': (os.path.basename(audio_file_path), audio_file)
                }
                data = {
                    'name': voice_name,
                    'description': description,
                    'language': language
                }

                # Remove Content-Type header for multipart form data
                headers = {
                    "Authorization": f"Bearer {self.api_key}"
                }

                print(f"\n🎤 Creating voice clone from: {audio_file_path}")
                print(f"   Name: {voice_name}")
                print(f"   Language: {language}")

                response = requests.post(
                    f"{self.base_url}/voices",
                    headers=headers,
                    data=data,
                    files=files
                )
                response.raise_for_status()
                result = response.json()

                voice_id = result.get('id')
                print(f"\n✅ Voice clone created successfully!")
                print(f"   Voice ID: {voice_id}")
                print(f"\n💡 Use this ID in your .env file or as a query parameter:")
                print(f"   reference_id={voice_id}")

                return voice_id

        except FileNotFoundError:
            print(f"❌ Audio file not found: {audio_file_path}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"❌ Error creating voice clone: {e}")
            if hasattr(e.response, 'text'):
                print(f"   Response: {e.response.text}")
            return None

    def delete_voice(self, voice_id: str) -> bool:
        """
        Delete a voice model

        Args:
            voice_id: The voice model ID to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            response = requests.delete(
                f"{self.base_url}/voices/{voice_id}",
                headers=self.headers
            )
            response.raise_for_status()
            print(f"✅ Voice {voice_id} deleted successfully")
            return True

        except requests.exceptions.RequestException as e:
            print(f"❌ Error deleting voice: {e}")
            return False

    def test_voice(self, voice_id: str, text: str = "Hello, this is a test of the voice model.") -> bool:
        """
        Test a voice model by generating sample audio

        Args:
            voice_id: The voice model ID to test
            text: Text to synthesize

        Returns:
            True if successful, False otherwise
        """
        try:
            data = {
                "text": text,
                "reference_id": voice_id,
                "format": "mp3"
            }

            print(f"\n🔊 Testing voice {voice_id}...")
            print(f"   Text: {text}")

            response = requests.post(
                f"{self.base_url}/tts",
                headers=self.headers,
                json=data
            )
            response.raise_for_status()

            # Save test audio
            output_path = f"test_voice_{voice_id}.mp3"
            with open(output_path, 'wb') as f:
                f.write(response.content)

            print(f"✅ Test audio saved to: {output_path}")
            print(f"   Play the file to hear the voice!")
            return True

        except requests.exceptions.RequestException as e:
            print(f"❌ Error testing voice: {e}")
            return False


def main():
    """Interactive CLI for voice management"""
    print("🎤 Fish Audio Voice Manager")
    print("=" * 50)

    try:
        manager = FishAudioVoiceManager()
    except ValueError as e:
        print(f"❌ {e}")
        print("Please set FISH_API_KEY in your .env file")
        return

    while True:
        print("\n" + "=" * 50)
        print("What would you like to do?")
        print("1. List all voices")
        print("2. Get voice details")
        print("3. Create voice clone")
        print("4. Test voice")
        print("5. Delete voice")
        print("6. Exit")
        print("=" * 50)

        choice = input("\nEnter choice (1-6): ").strip()

        if choice == "1":
            manager.list_voices()

        elif choice == "2":
            voice_id = input("Enter voice ID: ").strip()
            manager.get_voice_details(voice_id)

        elif choice == "3":
            audio_path = input("Enter path to audio file: ").strip()
            name = input("Enter voice name: ").strip()
            description = input("Enter description (optional): ").strip()
            language = input("Enter language code (e.g., en, es, fr) [default: en]: ").strip() or "en"
            manager.create_voice_clone(audio_path, name, description, language)

        elif choice == "4":
            voice_id = input("Enter voice ID to test: ").strip()
            text = input("Enter test text (or press Enter for default): ").strip()
            if not text:
                text = "Hello, this is a test of the voice model."
            manager.test_voice(voice_id, text)

        elif choice == "5":
            voice_id = input("Enter voice ID to delete: ").strip()
            confirm = input(f"Are you sure you want to delete {voice_id}? (yes/no): ").strip().lower()
            if confirm == "yes":
                manager.delete_voice(voice_id)

        elif choice == "6":
            print("\n👋 Goodbye!")
            break

        else:
            print("❌ Invalid choice. Please enter 1-6.")


if __name__ == "__main__":
    main()

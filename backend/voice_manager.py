"""
Voice Manager Module
Handles Fish Audio voice model creation, storage, and retrieval.
"""

import os
import json
import tempfile
from pathlib import Path
from typing import Optional, Dict, List
from fish_audio_sdk import Session
from dotenv import load_dotenv

load_dotenv()

# Storage file for voice model mappings
VOICE_MODELS_FILE = Path(__file__).parent / "voice_models.json"


class VoiceManager:
    """Manages Fish Audio voice models for different URLs/speakers"""
    
    def __init__(self):
        self.api_key = os.getenv("FISH_AUDIO_API_KEY")
        if not self.api_key:
            raise ValueError("FISH_AUDIO_API_KEY not found in environment variables")
        
        self.session = Session(self.api_key)
        self._load_models()
    
    def _load_models(self) -> None:
        """Load voice model mappings from storage file"""
        if VOICE_MODELS_FILE.exists():
            try:
                with open(VOICE_MODELS_FILE, 'r') as f:
                    self.models = json.load(f)
            except (json.JSONDecodeError, ValueError) as e:
                print(f"[VoiceManager] Warning: Corrupted voice_models.json file: {e}")
                print(f"[VoiceManager] Starting with empty models database")
                # Backup the corrupted file
                backup_path = VOICE_MODELS_FILE.with_suffix('.json.backup')
                VOICE_MODELS_FILE.rename(backup_path)
                print(f"[VoiceManager] Corrupted file backed up to: {backup_path}")
                self.models = {}
        else:
            self.models = {}
    
    def _save_models(self) -> None:
        """Save voice model mappings to storage file"""
        with open(VOICE_MODELS_FILE, 'w') as f:
            json.dump(self.models, f, indent=2)
    
    async def create_voice_model(
        self, 
        audio_data: bytes, 
        url: str, 
        title: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Create a new Fish Audio voice model from audio data.
        
        Args:
            audio_data: Audio file bytes (WAV or MP3)
            url: Source URL for the audio (used for storage key)
            title: Optional custom title for the model
            
        Returns:
            Dict with model_id, title, and url
        """
        # Extract hostname from URL for cleaner naming
        from urllib.parse import urlparse
        hostname = urlparse(url).netloc or "unknown"
        
        # Generate title if not provided
        if not title:
            title = f"Cloned Voice - {hostname}"
        
        # Create a temporary file for the audio
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            tmp_file.write(audio_data)
            tmp_path = tmp_file.name
        
        try:
            # Create the voice model using Fish Audio SDK
            print(f"[VoiceManager] Creating voice model: {title}")
            
            with open(tmp_path, 'rb') as audio_file:
                model = self.session.create_model(
                    title=title,
                    voices=[audio_file.read()],
                    description=f"Voice cloned from {hostname}",
                    visibility="private",  # Keep models private
                    # enhance_audio_quality=True,  # Optional: Enable for better quality
                )
            
            model_id = model.id
            print(f"[VoiceManager] Voice model created: {model_id}")
            
            # Store the model mapping
            # Convert datetime to ISO format string for JSON serialization
            created_at = None
            if hasattr(model, 'created_at') and model.created_at:
                if isinstance(model.created_at, str):
                    created_at = model.created_at
                else:
                    # Convert datetime to ISO format string
                    created_at = model.created_at.isoformat()
            
            self.models[url] = {
                "model_id": model_id,
                "title": title,
                "hostname": hostname,
                "created_at": created_at
            }
            self._save_models()
            
            return {
                "model_id": model_id,
                "title": title,
                "url": url,
                "hostname": hostname
            }
            
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    
    def get_voice_model(self, url: str) -> Optional[Dict[str, str]]:
        """
        Get the voice model for a specific URL.
        
        Args:
            url: Source URL
            
        Returns:
            Dict with model info or None if not found
        """
        return self.models.get(url)
    
    def list_voice_models(self) -> List[Dict[str, str]]:
        """
        List all stored voice models.
        
        Returns:
            List of model info dicts
        """
        return [
            {
                "url": url,
                **info
            }
            for url, info in self.models.items()
        ]
    
    def delete_voice_model(self, url: str) -> bool:
        """
        Delete a voice model mapping (note: doesn't delete from Fish Audio).
        
        Args:
            url: Source URL
            
        Returns:
            True if deleted, False if not found
        """
        if url in self.models:
            del self.models[url]
            self._save_models()
            return True
        return False


# Global voice manager instance
_voice_manager: Optional[VoiceManager] = None


def get_voice_manager() -> VoiceManager:
    """Get or create the global voice manager instance"""
    global _voice_manager
    if _voice_manager is None:
        _voice_manager = VoiceManager()
    return _voice_manager


#!/usr/bin/env python3
"""
Test script to verify Fish Audio TTS integration with Pipecat
"""
import os
import asyncio
from dotenv import load_dotenv
from pipecat.services.fish.tts import FishAudioTTSService
from pipecat.frames.frames import TTSTextFrame, TTSAudioRawFrame

load_dotenv()

async def test_fish_audio():
    """Test Fish Audio TTS to verify it outputs audio frames"""

    print("=" * 60)
    print("Testing Fish Audio TTS Integration")
    print("=" * 60)

    # Initialize Fish Audio TTS
    api_key = os.getenv("FISH_API_KEY")
    voice_id = os.getenv("FISH_VOICE_ID", "7f92f8afb8ec43bf81429cc1c9199cb1")

    if not api_key:
        print("❌ FISH_API_KEY not found in .env")
        return

    print(f"✓ API Key: {api_key[:10]}...")
    print(f"✓ Voice ID: {voice_id}")

    try:
        tts = FishAudioTTSService(
            api_key=api_key,
            model=voice_id,
        )
        print("✓ FishAudioTTSService initialized")

        # Test text
        test_text = "Hello, this is a test of the Fish Audio TTS system."
        print(f"\n📝 Test text: {test_text}")

        # Create TTS frame
        tts_frame = TTSTextFrame(text=test_text)

        # Process the frame
        print("\n🔄 Processing TTS frame...")
        audio_frame_count = 0

        async for frame in tts.run_tts(tts_frame):
            if isinstance(frame, TTSAudioRawFrame):
                audio_frame_count += 1
                print(f"  ✓ Received TTSAudioRawFrame #{audio_frame_count}: {len(frame.audio)} bytes")

        print(f"\n✅ Test completed! Received {audio_frame_count} audio frames")

        if audio_frame_count == 0:
            print("⚠️  WARNING: No audio frames received!")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_fish_audio())

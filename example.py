"""
Example: Using the pipeline programmatically

This shows how to use the translation pipeline in your own Python code.
"""

from full_pipeline import process_audio_translation

# Example 1: Basic usage with auto-detected source language
def example_basic():
    """Basic example: English to Spanish translation"""
    result = process_audio_translation(
        audio_file_path="./input_audio/my_recording.mp3",
        target_language="Spanish"
    )
    
    print(f"Original: {result['original_text']}")
    print(f"Translated: {result['translated_text']}")
    print(f"Audio saved to: {result['audio_file']}")

# Example 2: With source language specified
def example_with_source_language():
    """Specify source language for better translation context"""
    result = process_audio_translation(
        audio_file_path="./input_audio/my_recording.mp3",
        target_language="French",
        source_language="en"  # English
    )
    
    return result

# Example 3: Using your cloned voice
def example_with_voice_clone():
    """Use your cloned voice for output"""
    # First, make sure you have a voice_model_id.txt file
    # (created by running 1_clone_voice.py)
    
    with open("voice_model_id.txt", "r") as f:
        my_voice_id = f.read().strip()
    
    result = process_audio_translation(
        audio_file_path="./input_audio/my_recording.mp3",
        target_language="German",
        voice_model_id=my_voice_id
    )
    
    return result

# Example 4: Different output format
def example_wav_output():
    """Generate WAV instead of MP3"""
    result = process_audio_translation(
        audio_file_path="./input_audio/my_recording.mp3",
        target_language="Italian",
        output_format="wav"  # Higher quality, larger file
    )
    
    return result

# Example 5: Batch processing multiple files
def example_batch_processing():
    """Process multiple audio files"""
    import os
    from config import INPUT_AUDIO_DIR
    
    audio_files = [f for f in os.listdir(INPUT_AUDIO_DIR) 
                   if f.endswith(('.mp3', '.wav'))]
    
    results = []
    for audio_file in audio_files:
        audio_path = os.path.join(INPUT_AUDIO_DIR, audio_file)
        
        print(f"\nProcessing: {audio_file}")
        result = process_audio_translation(
            audio_file_path=audio_path,
            target_language="Spanish"
        )
        results.append(result)
    
    return results

# Example 6: Multiple target languages
def example_multiple_languages():
    """Translate the same audio to multiple languages"""
    audio_path = "./input_audio/my_recording.mp3"
    target_languages = ["Spanish", "French", "German", "Italian"]
    
    results = {}
    for language in target_languages:
        print(f"\nTranslating to {language}...")
        result = process_audio_translation(
            audio_file_path=audio_path,
            target_language=language
        )
        results[language] = result
    
    return results

# Example 7: Error handling
def example_with_error_handling():
    """Proper error handling"""
    try:
        result = process_audio_translation(
            audio_file_path="./input_audio/my_recording.mp3",
            target_language="Spanish"
        )
        
        print("✓ Success!")
        return result
        
    except FileNotFoundError as e:
        print(f"❌ File not found: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("Audio Translation Pipeline - Examples")
    print("="*60)
    print("\nUncomment the example you want to run:\n")
    
    # Uncomment one of these to run:
    
    # example_basic()
    # example_with_source_language()
    # example_with_voice_clone()
    # example_wav_output()
    # example_batch_processing()
    # example_multiple_languages()
    # example_with_error_handling()
    
    print("\nEdit example.py and uncomment an example to run it!")

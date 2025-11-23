"""
Step 3: Translate Text
This script uses GPT-4o to translate your transcribed text to another language.

Requirements:
- A text file to translate (from step 2 or your own)
"""

import os
from openai import OpenAI
from config import OPENAI_API_KEY, DEFAULT_TARGET_LANGUAGE


def translate_text(text, target_language, source_language=None):
    """
    Translate text using GPT-4o.
    
    Args:
        text (str): Text to translate
        target_language (str): Target language (e.g., "Spanish", "French", "German")
        source_language (str, optional): Source language for context
    
    Returns:
        str: Translated text
    """
    client = OpenAI(api_key=OPENAI_API_KEY)
    
    if source_language:
        system_prompt = f"You are a professional translator. Translate the following text from {source_language} to {target_language}. Maintain the tone and meaning accurately."
    else:
        system_prompt = f"You are a professional translator. Translate the following text to {target_language}. Maintain the tone and meaning accurately."
    
    print(f"Translating to {target_language}...")
    print("This may take a moment...\n")
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        temperature=0.3  # Lower temperature for more consistent translations
    )
    
    return response.choices[0].message.content


def load_text_file(file_path):
    """Load text from a file."""
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def save_translation(text, output_file):
    """Save translation to a text file."""
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Translation saved to: {output_file}")


if __name__ == "__main__":
    print("=" * 60)
    print("Text Translation (GPT-4o)")
    print("=" * 60)
    
    # Find text files
    text_files = [f for f in os.listdir(".") if f.endswith('.txt') and f.startswith('transcription_')]
    
    if text_files:
        print(f"\nFound {len(text_files)} transcription file(s):")
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
        print("\nNo transcription files found.")
        text_file_path = input("Enter path to text file: ").strip()
        if not os.path.exists(text_file_path):
            print(f"❌ File not found: {text_file_path}")
            exit(1)
        selected_file = text_file_path
    
    # Load text
    try:
        original_text = load_text_file(selected_file)
        print(f"\n{'=' * 60}")
        print("ORIGINAL TEXT:")
        print("=" * 60)
        print(original_text[:500] + ("..." if len(original_text) > 500 else ""))
        print("=" * 60)
    except Exception as e:
        print(f"❌ Error loading file: {e}")
        exit(1)
    
    # Get target language
    print("\nTarget language options:")
    print("  Spanish, French, German, Italian, Portuguese, ")
    print("  Chinese, Japanese, Korean, Arabic, Hindi, etc.")
    target_lang = input(f"Target language (default: {DEFAULT_TARGET_LANGUAGE}): ").strip()
    if not target_lang:
        target_lang = DEFAULT_TARGET_LANGUAGE
    
    # Optional: source language
    source_lang = input("Source language (optional, for better context): ").strip() or None
    
    try:
        # Translate
        translated_text = translate_text(original_text, target_lang, source_lang)
        
        print("\n" + "=" * 60)
        print(f"TRANSLATION ({target_lang.upper()}):")
        print("=" * 60)
        print(translated_text)
        print("=" * 60)
        
        # Save to file
        base_name = os.path.splitext(os.path.basename(selected_file))[0]
        output_file = f"translation_{target_lang.lower()}_{base_name}.txt"
        save_translation(translated_text, output_file)
        
        print(f"\n✓ Translation complete!")
        print(f"Translated text saved to: {output_file}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")

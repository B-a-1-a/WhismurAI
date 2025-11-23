#!/usr/bin/env python3
"""
Check if all required files are in the right place
"""

import os

print("=" * 70)
print("File Structure Diagnostic")
print("=" * 70)

# Check current directory
print(f"\nCurrent directory: {os.getcwd()}")

# Check for templates
print("\n✓ Checking templates/")
if os.path.exists("templates"):
    print("  ✓ templates/ exists")
    files = os.listdir("templates")
    for f in files:
        print(f"    - {f}")
else:
    print("  ❌ templates/ NOT FOUND!")
    print("  → Create it with: mkdir templates")

# Check for static
print("\n✓ Checking static/")
if os.path.exists("static"):
    print("  ✓ static/ exists")
    for root, dirs, files in os.walk("static"):
        level = root.replace("static", "").count(os.sep)
        indent = " " * 2 * level
        print(f"  {indent}{os.path.basename(root)}/")
        subindent = " " * 2 * (level + 1)
        for file in files:
            print(f"  {subindent}- {file}")
else:
    print("  ❌ static/ NOT FOUND!")
    print("  → Create it with: mkdir -p static/css static/js")

# Check for voice samples
print("\n✓ Checking voice_samples/")
if os.path.exists("voice_samples"):
    print("  ✓ voice_samples/ exists")
    files = [
        f
        for f in os.listdir("voice_samples")
        if f.endswith((".mp3", ".wav", ".flac", ".m4a"))
    ]
    if files:
        for f in files:
            print(f"    - {f}")
    else:
        print("    ⚠️  No audio files found")
else:
    print("  ❌ voice_samples/ NOT FOUND!")
    print("  → Create it with: mkdir voice_samples")

# Check for required Python files
print("\n✓ Checking Python files:")
required_files = ["app_streaming.py", "config.py", ".env"]

for file in required_files:
    if os.path.exists(file):
        print(f"  ✓ {file}")
    else:
        print(f"  ❌ {file} NOT FOUND!")

print("\n" + "=" * 70)
print("Quick Fix Commands:")
print("=" * 70)
print(
    """
# If templates/ is missing:
mkdir templates
cp /path/to/templates/realtime.html templates/

# If static/ is missing:
mkdir -p static/css static/js
cp /path/to/static/css/style.css static/css/
cp /path/to/static/js/streaming.js static/js/

# If voice_samples/ is missing:
mkdir voice_samples
cp your_audio.mp3 voice_samples/
"""
)

# Audio Translation Pipeline with Voice Cloning

<<<<<<< HEAD
A Chrome Extension for real-time browser tab audio translation using AI.

## Contributors

1. Bala Shukla
2. Aaryan Devgun
3. Bhinu Puvvala
4. Sumedh Kulkarni

## Overview

WhismurAI captures live audio from a browser tab, translates it in real-time, and plays it back using Fish Audio for Text-to-Speech (TTS).

**Tech Stack:**
- **Frontend:** React 18, Vite, Tailwind CSS, Chrome Extension Manifest V3
- **Backend:** Python 3.10 - 3.13 (Python 3.14+ not yet supported), FastAPI, Pipecat AI
- **AI Services:** Deepgram (STT), OpenAI (Translation), Fish Audio (TTS)

## Project Structure

```
WhismurAI/
├── backend/                 # Python FastAPI Server
│   ├── bot.py              # Pipecat Pipeline Logic
│   ├── server.py           # FastAPI Endpoints
│   ├── requirements.txt    # Python Dependencies
│   └── README.md           # Backend Setup Instructions
└── extension/              # React Chrome Extension
    ├── src/
    │   ├── App.jsx         # Main UI Component
    │   ├── main.jsx        # React Entry Point
    │   └── index.css       # Tailwind Styles
    ├── public/
    │   ├── manifest.json   # Extension Manifest
    │   └── background.js   # Service Worker (Audio Logic)
    ├── dist/               # Build Output (load this in Chrome)
    └── package.json
```

## Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
=======
Complete workflow to record your voice, translate audio to another language, and generate speech using Fish Audio TTS with optional voice cloning.

## 📋 Features

- **Voice Cloning**: Clone your voice using Fish Audio
- **Transcription**: Convert audio to text using OpenAI Whisper
- **Translation**: Translate text using GPT-4o
- **Speech Generation**: Generate natural-sounding speech in the target language
- **Full Pipeline**: Run all steps automatically

## 🚀 Quick Start

### 1. Setup

```bash
python3.10 -m venv .venv
source .venv/bin/activate
>>>>>>> bhinu

# Install dependencies
pip install -r requirements.txt

<<<<<<< HEAD
# Create .env file with your API keys
cat > .env << EOF
FISH_API_KEY=your_fish_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
EOF

# Start the server
uvicorn server:app --reload
```

The backend server will start at `http://localhost:8000`

### 2. Extension Setup

```bash
cd extension

# Install dependencies
npm install

# Build the extension
npm run build
```

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. The WhismurAI extension should now appear in your extensions

## Usage

1. **Start the Backend:** Make sure the FastAPI server is running (`uvicorn server:app --reload`)
2. **Open a Tab:** Navigate to any page with audio (e.g., YouTube video)
3. **Open Extension:** Click the WhismurAI icon in your Chrome toolbar
4. **Select Language:** Choose your target translation language
5. **Start Translation:** Click "Start Translation" to begin real-time translation
6. **Stop Translation:** Click "Stop Translation" when done

## API Keys Required

You'll need to obtain API keys from:

- **Fish Audio:** https://fish.audio/
- **Deepgram:** https://deepgram.com/
- **OpenAI:** https://platform.openai.com/

## Development

### Backend Development

```bash
cd backend
source venv/bin/activate
uvicorn server:app --reload
```

### Extension Development

```bash
cd extension
npm run dev  # Development mode
npm run build  # Production build
```

After making changes, rebuild the extension and click the refresh icon in `chrome://extensions/`

## Features

- ✅ Real-time audio capture from browser tabs
- ✅ Speech-to-Text using Deepgram
- ✅ AI-powered translation using OpenAI GPT-4o-mini
- ✅ Natural Text-to-Speech using Fish Audio
- ✅ Support for multiple languages (Spanish, French, German, Japanese, Chinese, Korean, Italian, Portuguese)
- ✅ Clean, modern UI with Tailwind CSS

## Future Enhancements

- Voice cloning for personalized translation voices
- Multiple voice profiles
- Translation history
- Offline mode support
- Additional language support

## License

See LICENSE file for details.

## Troubleshooting

### Backend Issues

- **Import errors:** Make sure you've activated the virtual environment and installed all dependencies
- **API key errors:** Verify your `.env` file has valid API keys
- **Port conflicts:** If port 8000 is in use, specify a different port: `uvicorn server:app --port 8001`

### Extension Issues

- **Extension not loading:** Make sure you've built the extension (`npm run build`) and are loading the `dist` folder
- **WebSocket connection failed:** Ensure the backend server is running on `http://localhost:8000`
- **No audio capture:** Grant the extension permission to capture audio when prompted
- **Manifest errors:** Check that `manifest.json` and `background.js` are in the `dist` folder

## Support

For issues or questions, please open an issue on the GitHub repository.
=======
# Copy environment template and add your API keys
cp .env.example .env
# Edit .env and add your API keys
```

Get your API keys:

- **OpenAI**: https://platform.openai.com/api-keys
- **Fish Audio**: https://fish.audio/app/api-keys/

### 2. Directory Structure

```
project/
├── voice_samples/      # Put 3-5 min of your voice recordings here
├── input_audio/        # Put audio files you want to translate here
├── output_audio/       # Generated audio will be saved here
└── *.py               # Scripts
```

### 3. Run the Workflow

#### Option A: Run Full Pipeline (Automated)

```bash
python full_pipeline.py
```

This will:

1. Transcribe your audio
2. Translate it to your target language
3. Generate speech (with your voice if you've cloned it)

#### Option B: Run Step-by-Step

```bash
# Step 1: Clone your voice (run once)
python 1_clone_voice.py

# Step 2: Transcribe audio to text
python 2_transcribe.py

# Step 3: Translate text
python 3_translate.py

# Step 4: Generate speech
python 4_generate_speech.py
```

## 📝 Detailed Usage

### Step 1: Clone Your Voice (One-time setup)

```bash
python 1_clone_voice.py
```

**Requirements:**

- Place 3-5 minutes of clean voice recordings in `./voice_samples/`
- Supported formats: `.mp3`, `.wav`, `.flac`
- Use clear recordings without background noise

**Tips for best results:**

- Record in a quiet environment
- Use consistent tone and pace
- Include varied speech patterns
- Avoid music or background noise

**Output:**

- Creates a voice model on Fish Audio
- Saves model ID to `voice_model_id.txt`
- This ID will be used automatically in step 4

### Step 2: Transcribe Audio

```bash
python 2_transcribe.py
```

**What it does:**

- Converts your audio recording to text using OpenAI Whisper
- Auto-detects language or you can specify it
- Saves transcription to `transcription_[filename].txt`

**Input:**

- Place your audio file in `./input_audio/`
- Supported formats: `.mp3`, `.wav`, `.m4a`, `.flac`, `.webm`

**Output:**

- Text file with transcription

### Step 3: Translate Text

```bash
python 3_translate.py
```

**What it does:**

- Translates your transcribed text using GPT-4o
- Maintains tone and meaning accurately
- Saves translation to `translation_[language]_[filename].txt`

**Supported languages:**

- Spanish, French, German, Italian, Portuguese
- Chinese, Japanese, Korean, Arabic, Hindi
- And many more!

**Output:**

- Text file with translation

### Step 4: Generate Speech

```bash
python 4_generate_speech.py
```

**What it does:**

- Generates audio from translated text using Fish Audio
- Uses your cloned voice if available
- Saves audio to `./output_audio/`

**Options:**

- **Voice Model**: Use your cloned voice (from step 1) or generic voice
- **Format**: mp3, wav, opus
- **Quality**: Adjustable bitrate for mp3

**Output:**

- Audio file in `./output_audio/` directory

## 🔧 Configuration

Edit `config.py` to customize:

```python
# Default settings
DEFAULT_TARGET_LANGUAGE = "Spanish"
DEFAULT_AUDIO_FORMAT = "mp3"

# Directory paths
VOICE_SAMPLES_DIR = "./voice_samples"
INPUT_AUDIO_DIR = "./input_audio"
OUTPUT_AUDIO_DIR = "./output_audio"
```

## 📊 Example Workflow

```bash
# 1. First time: Clone your voice
python 1_clone_voice.py
# Output: voice_model_id.txt created

# 2. Place your audio in input_audio/my_speech.mp3

# 3. Run full pipeline
python full_pipeline.py
# Select: my_speech.mp3
# Source language: English (auto-detected)
# Target language: Spanish
# Use voice model: Yes

# Output:
# - transcription_my_speech.txt
# - translation_spanish_my_speech.txt
# - output_audio/translated_spanish_my_speech.mp3
```

## 🎯 Use Cases

- **Language Learning**: Hear yourself speak in another language
- **Content Creation**: Translate video voiceovers
- **Accessibility**: Create multilingual versions of content
- **Communication**: Bridge language barriers in recordings

## ⚙️ API Rate Limits

**OpenAI:**

- Whisper: Check your account limits
- GPT-4o: Check your account limits

**Fish Audio:**

- See: https://fish.audio/developer-guide/models-pricing/pricing-and-rate-limits

## 🐛 Troubleshooting

### "No audio files found"

- Make sure your audio files are in the correct directory
- Check file format is supported (.mp3, .wav, etc.)

### "API key invalid"

- Verify your API keys in `.env` file
- Make sure there are no extra spaces or quotes

### "Voice model not found"

- Run `1_clone_voice.py` first
- Check that `voice_model_id.txt` exists
- Verify model ID is correct

### "Audio quality is poor"

- Use higher quality input audio
- For voice cloning, ensure clean recordings
- Try different audio format (wav for best quality)

## 💡 Tips

1. **Voice Cloning Quality:**

   - Use at least 3-5 minutes of audio
   - Record in a quiet environment
   - Speak naturally with varied intonation

2. **Translation Quality:**

   - Provide source language for better context
   - Review translations before generating speech
   - Use GPT-4o for most accurate translations

3. **Speech Generation:**
   - Use your voice model for consistent results
   - Choose mp3 for smaller files, wav for best quality
   - Balance latency vs quality based on needs

## 📚 API Documentation

- **Fish Audio**: https://fish.audio/docs
- **OpenAI Whisper**: https://platform.openai.com/docs/guides/speech-to-text
- **OpenAI GPT-4o**: https://platform.openai.com/docs/guides/text-generation

## 🤝 Support

If you encounter issues:

1. Check the troubleshooting section
2. Verify your API keys and credits
3. Review API documentation
4. Check file formats and paths

## 📄 License

This project is for educational and personal use. Make sure to comply with:

- OpenAI's usage policies
- Fish Audio's terms of service
- Copyright laws for voice cloning and content

---

**Happy translating! 🎙️🌍**
>>>>>>> bhinu

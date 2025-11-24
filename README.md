# WhismurAI

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

# Install dependencies
pip install -r requirements.txt

# Create .env file with your API keys
cat > .env << EOF
FISH_AUDIO_API_KEY=your_fish_audio_api_key_here
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
6. **Voice Cloning (Automatic):** The extension automatically captures the first 10 seconds to clone the speaker's voice
7. **Enable Cloned Voice:** Once cloning completes, toggle the switch to use the cloned voice for translations
8. **Stop Translation:** Click "Stop Translation" when done

See the [Voice Cloning Setup Guide](./VOICE_CLONING_SETUP.md) for detailed information about voice cloning features.

## API Keys Required

You'll need to obtain API keys from:

- **Fish Audio:** https://fish.audio/
- **Deepgram:** https://deepgram.com/
- **OpenAI:** https://platform.openai.com/

## Documentation

- **[Voice Cloning Setup Guide](./VOICE_CLONING_SETUP.md)** - Complete guide to setting up and using automatic voice cloning
- **[Translation Implementation Guide](./TRANSLATION_IMPLEMENTATION.md)** - Detailed explanation of the translation pipeline, optimizations, and performance tuning
- **[Backend Setup](./backend/README.md)** - Backend configuration and architecture details
- **[Extension Setup](./extension/README.md)** - Chrome extension development guide

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
- ✅ Speech-to-Text using Deepgram (optimized for low latency)
- ✅ **Ultra-fast translation using OpenAI gpt-5-nano** (< 1s latency, 5/5 speed rating)
- ✅ Natural Text-to-Speech using Fish Audio with voice cloning
- ✅ **🆕 Automatic Voice Cloning** - Clone speaker voices from tab audio and use them for translations
- ✅ Support for 20+ languages (Spanish, French, German, Japanese, Chinese, Korean, Italian, Portuguese, Arabic, Hindi, and more)
- ✅ Clean, modern UI with Tailwind CSS
- ✅ Optimized pipeline for near-instant translation
- ✅ Per-URL voice model persistence

## Future Enhancements

- Multiple voice profiles per URL
- Voice model management UI
- Translation history export
- Offline mode support
- Additional language support
- Custom voice training with longer samples

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

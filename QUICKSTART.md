# WhismurAI Quick Start Guide

Get up and running with WhismurAI in 5 minutes!

## Prerequisites

- Python 3.10 - 3.13 (Python 3.14+ not yet supported)
- Node.js 18+
- Chrome Browser
- API Keys from:
  - Fish Audio (https://fish.audio/)
  - Deepgram (https://deepgram.com/)
  - OpenAI (https://platform.openai.com/)

## Step 1: Backend Setup (2 minutes)

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your API keys
cat > .env << EOF
FISH_API_KEY=your_fish_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
EOF

# Start the server
uvicorn server:app --reload
```

✅ Backend should now be running at `http://localhost:8000`

## Step 2: Extension Setup (2 minutes)

Open a new terminal:

```bash
# Navigate to extension directory
cd extension

# Install dependencies
npm install

# Build the extension
npm run build
```

✅ Extension is now built in the `extension/dist/` folder

## Step 3: Load Extension in Chrome (1 minute)

1. Open Chrome and navigate to: `chrome://extensions/`
2. Toggle "Developer mode" ON (top right corner)
3. Click "Load unpacked" button
4. Navigate to and select: `WhismurAI/extension/dist/`
5. The WhismurAI icon should appear in your Chrome toolbar

✅ Extension is now loaded!

## Step 4: Test It Out!

1. **Open a video**: Go to YouTube or any site with audio
2. **Click the extension icon**: Opens the WhismurAI popup
3. **Select target language**: Choose from the dropdown (e.g., Spanish)
4. **Click "Start Translation"**: Begin real-time translation
5. **Listen**: You should hear the translated audio!
6. **Click "Stop Translation"**: When you're done

## Troubleshooting

### Backend won't start
- Check that you're in the virtual environment: `source venv/bin/activate`
- Verify API keys are set in `.env`
- Check port 8000 is not in use

### Extension won't load
- Make sure you've run `npm run build`
- Load the `dist` folder, not the `extension` folder
- Check for errors in `chrome://extensions/`

### No audio translation
- Verify backend is running: visit `http://localhost:8000`
- Check browser console for errors (F12)
- Grant audio capture permissions when prompted

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check [Setup.md](Setup.md) for the complete technical overview
- Explore different target languages
- Adjust translation settings in the code

## Support

Having issues? Check the main README.md troubleshooting section or open an issue on GitHub.

Happy translating! 🎉


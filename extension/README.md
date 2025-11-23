# WhismurAI Chrome Extension

React-based Chrome Extension for real-time browser audio translation.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The built extension will be in the `dist/` folder.

## Loading in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

## Structure

- `src/App.jsx` - Main UI component
- `src/main.jsx` - React entry point
- `public/manifest.json` - Extension manifest
- `public/background.js` - Service worker for audio capture
- `dist/` - Build output (load this in Chrome)

## Requirements

- Backend server must be running on `http://localhost:8000`
- See main README for backend setup instructions


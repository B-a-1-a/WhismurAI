import React, { useState } from 'react';
import './index.css';

function App() {
  const [status, setStatus] = useState('idle'); // idle, translating
  const [targetLang, setTargetLang] = useState('es');

  const handleStart = () => {
    setStatus('translating');
    chrome.runtime.sendMessage({
      action: 'START_SESSION',
      targetLang: targetLang
    });
  };

  const handleStop = () => {
    setStatus('idle');
    chrome.runtime.sendMessage({
      action: 'STOP_SESSION'
    });
  };

  return (
    <div className="w-80 p-4 bg-gray-900 text-white h-96 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-cyan-400">WhismurAI Live Translator</h1>
      
      {/* Language Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Target Language:</label>
        <select 
          value={targetLang} 
          onChange={(e) => setTargetLang(e.target.value)}
          disabled={status === 'translating'}
          className="bg-gray-800 p-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
        >
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="ja">Japanese</option>
          <option value="zh">Chinese</option>
          <option value="ko">Korean</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
        </select>
      </div>

      {/* Control Buttons */}
      {status === 'idle' ? (
        <button 
          onClick={handleStart}
          className="bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded font-bold transition transform active:scale-95"
        >
          Start Translation
        </button>
      ) : (
        <button 
          onClick={handleStop}
          className="bg-red-600 hover:bg-red-500 text-white py-3 rounded font-bold transition transform active:scale-95"
        >
          Stop Translation
        </button>
      )}

      {/* Status Display */}
      {status === 'translating' && (
        <div className="p-3 bg-gray-800 rounded border border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-sm text-gray-400">Status:</p>
          </div>
          <p className="text-lg text-green-400 font-mono mt-1">
            Translating to {targetLang.toUpperCase()}
          </p>
        </div>
      )}

      {/* Info Section */}
      <div className="mt-auto p-3 bg-gray-800/50 rounded text-xs text-gray-500">
        <p>💡 Click "Start Translation" to begin capturing and translating audio from the current tab.</p>
      </div>
    </div>
  );
}

export default App;


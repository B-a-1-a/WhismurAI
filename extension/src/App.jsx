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

  return (
    <div className="w-80 p-4 bg-gray-900 text-white h-96 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-cyan-400">Fish Live Translate</h1>
      
      {/* Language Selector */}
      <select 
        value={targetLang} 
        onChange={(e) => setTargetLang(e.target.value)}
        className="bg-gray-800 p-2 rounded border border-gray-700"
      >
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="ja">Japanese</option>
      </select>

      {/* Start Button */}
      {status === 'idle' && (
        <button 
          onClick={handleStart}
          className="bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded font-bold transition"
        >
          Start Listening
        </button>
      )}

      {/* Status Indicators */}
      {status !== 'idle' && (
        <div className="p-3 bg-gray-800 rounded animate-pulse border border-gray-700">
          <p className="text-sm text-gray-400">Status:</p>
          <p className="text-lg text-green-400 font-mono">
            {status === 'translating' && 'Translating...'}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;


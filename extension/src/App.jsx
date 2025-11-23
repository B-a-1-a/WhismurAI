import React, { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [status, setStatus] = useState('idle'); // idle, translating
  const [targetLang, setTargetLang] = useState('es');
  const [transcripts, setTranscripts] = useState([]);
  const transcriptsEndRef = useRef(null);

  useEffect(() => {
    // Initial load
    chrome.storage.local.get(['transcripts'], (result) => {
      if (result.transcripts) {
        setTranscripts(result.transcripts);
      }
    });

    // Fetch current status from background
    chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
      if (response) {
        if (response.isTranslating) {
          setStatus('translating');
        }
        if (response.targetLang) {
          setTargetLang(response.targetLang);
        }
      }
    });

    // Listen for changes
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.transcripts) {
        console.log('[Popup] Storage changed, new transcripts:', changes.transcripts.newValue);
        setTranscripts(changes.transcripts.newValue || []);
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const handleStart = () => {
    setStatus('translating');
    // Clear previous transcripts when starting new session
    chrome.storage.local.set({ transcripts: [] });
    setTranscripts([]);
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

  const handleClear = () => {
    chrome.storage.local.set({ transcripts: [] });
    setTranscripts([]);
  };

  return (
    <div className="w-80 p-4 bg-gray-900 text-white h-[600px] flex flex-col gap-4">
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
      <div className="flex gap-2">
        {status === 'idle' ? (
          <button 
            onClick={handleStart}
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded font-bold transition transform active:scale-95"
          >
            Start Translation
          </button>
        ) : (
          <button 
            onClick={handleStop}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white py-3 rounded font-bold transition transform active:scale-95"
          >
            Stop Translation
          </button>
        )}
        {transcripts.length > 0 && (
          <button 
            onClick={handleClear}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded font-bold transition transform active:scale-95"
            title="Clear transcripts"
          >
            Clear
          </button>
        )}
      </div>

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

      {/* Transcript Section */}
      <div className="flex-1 bg-gray-800/50 rounded border border-gray-700 p-2 overflow-y-auto flex flex-col gap-2">
        {transcripts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-xs italic">
            Transcript will appear here...
          </div>
        ) : (
          transcripts.map((t, i) => (
            <div key={i} className="mb-2">
              {t.original && (
                <div className="text-sm p-2 rounded border bg-gray-800 border-gray-700 text-gray-300 mb-1">
                  <p className="text-[10px] uppercase font-bold opacity-50 mb-1">Original</p>
                  <p>{t.original}</p>
                </div>
              )}
              {t.translation && (
                <div className="text-sm p-2 rounded border bg-cyan-900/20 border-cyan-900/50 text-cyan-100">
                  <p className="text-[10px] uppercase font-bold opacity-50 mb-1">{targetLang.toUpperCase()}</p>
                  <p>{t.translation}</p>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={transcriptsEndRef} />
      </div>

      {/* Info Section */}
      <div className="p-3 bg-gray-800/50 rounded text-xs text-gray-500">
        <p>💡 Click "Start Translation" to begin capturing and translating audio from the current tab.</p>
      </div>
    </div>
  );
}

export default App;


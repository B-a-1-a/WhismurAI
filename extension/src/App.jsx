import React, { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [status, setStatus] = useState('idle'); // idle, translating
  const [targetLang, setTargetLang] = useState('es');
  const [transcripts, setTranscripts] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState(null);
  const transcriptsEndRef = useRef(null);

  // Language code to name mapping
  const languageNames = {
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ko': 'Korean',
    'it': 'Italian',
    'pt': 'Portuguese'
  };

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

    // Listen for storage changes
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.transcripts) {
        console.log('[Popup] Storage changed, new transcripts:', changes.transcripts.newValue);
        setTranscripts(changes.transcripts.newValue || []);
      }
    };
    
    // Listen for interim messages
    const handleMessage = (msg) => {
      if (msg.type === 'TRANSCRIPT_INTERIM') {
        setInterimTranscript(msg.data); // data is { text, mode } or null
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, interimTranscript]); // Scroll on interim updates too

  const handleStart = () => {
    setStatus('translating');
    // Clear previous transcripts when starting new session
    chrome.storage.local.set({ transcripts: [] });
    setTranscripts([]);
    setInterimTranscript(null);
    chrome.runtime.sendMessage({
      action: 'START_SESSION',
      targetLang: targetLang
    });
  };

  const handleStop = () => {
    setStatus('idle');
    setInterimTranscript(null);
    chrome.runtime.sendMessage({
      action: 'STOP_SESSION'
    });
  };

  const handleClear = () => {
    chrome.storage.local.set({ transcripts: [] });
    setTranscripts([]);
    setInterimTranscript(null);
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
            Translating to {languageNames[targetLang] || targetLang}
          </p>
        </div>
      )}

      {/* Transcript Section */}
      <div className="flex-1 bg-gray-800/50 rounded border border-gray-700 p-2 overflow-y-auto flex flex-col gap-2">
        {transcripts.length === 0 && !interimTranscript ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-xs italic">
            Transcript will appear here...
          </div>
        ) : (
          <>
            {transcripts.map((t, i) => (
              <div key={i} className="mb-2">
                {t.original && (
                  <div className="text-sm p-2 rounded border bg-gray-800 border-gray-700 text-gray-300 mb-1">
                    <p className="text-[10px] uppercase font-bold opacity-50 mb-1">Original</p>
                    <p>{t.original}</p>
                  </div>
                )}
                {t.translation && (
                  <div className="text-sm p-2 rounded border bg-cyan-900/20 border-cyan-900/50 text-cyan-100">
                    <p className="text-[10px] uppercase font-bold opacity-50 mb-1">{languageNames[targetLang] || targetLang.toUpperCase()}</p>
                    <p>{t.translation}</p>
                  </div>
                )}
              </div>
            ))}
            
            {/* Interim Transcript (Ghost Text) */}
            {interimTranscript && (
              <div className="mb-2 opacity-75 animate-pulse">
                {interimTranscript.mode === 'original' ? (
                   <div className="text-sm p-2 rounded border bg-gray-800 border-gray-600 text-gray-400 mb-1 border-dashed">
                    <p className="text-[10px] uppercase font-bold opacity-50 mb-1">Listening...</p>
                    <p className="italic">{interimTranscript.text}...</p>
                  </div>
                ) : (
                   <div className="text-sm p-2 rounded border bg-cyan-900/10 border-cyan-900/30 text-cyan-200 border-dashed">
                    <p className="text-[10px] uppercase font-bold opacity-50 mb-1">Translating...</p>
                    <p className="italic">{interimTranscript.text}...</p>
                  </div>
                )}
              </div>
            )}
          </>
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

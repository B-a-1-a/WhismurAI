import React, { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [status, setStatus] = useState('idle'); // idle, translating
  const [targetLang, setTargetLang] = useState('es');
  const [transcripts, setTranscripts] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState(null);
  const transcriptsEndRef = useRef(null);
  
  // Voice cloning state
  const [voiceCloneStatus, setVoiceCloneStatus] = useState('idle'); // idle, capturing, processing, ready, error
  const [voiceCloneMessage, setVoiceCloneMessage] = useState('');
  const [hasVoiceModel, setHasVoiceModel] = useState(false);
  const [useClonedVoice, setUseClonedVoice] = useState(false);
  const [currentVoiceModel, setCurrentVoiceModel] = useState(null);
  
  // Fish Audio API key state
  const [fishApiKey, setFishApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

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

  // Check for voice models on mount and periodically
  const checkVoiceModel = () => {
    chrome.storage.local.get(['voiceModels'], (result) => {
      if (result.voiceModels) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.url) {
            const model = result.voiceModels[tabs[0].url];
            if (model) {
              console.log('[Popup] Found voice model for current page:', model);
              setHasVoiceModel(true);
              setCurrentVoiceModel(model);
              setVoiceCloneStatus('ready');
            } else {
              console.log('[Popup] No voice model found for:', tabs[0].url);
            }
          }
        });
      }
    });
  };

  useEffect(() => {
    // Initial load
    chrome.storage.local.get(['transcripts', 'voiceModels', 'fishApiKey'], (result) => {
      if (result.transcripts) {
        setTranscripts(result.transcripts);
      }
      
      if (result.fishApiKey) {
        setFishApiKey(result.fishApiKey);
      }
      
      // Check for voice model
      checkVoiceModel();
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
      if (area === 'local') {
        if (changes.transcripts) {
          console.log('[Popup] Storage changed, new transcripts:', changes.transcripts.newValue);
          setTranscripts(changes.transcripts.newValue || []);
        }
        if (changes.voiceModels) {
          console.log('[Popup] Voice models changed, checking for current page...');
          checkVoiceModel();
        }
      }
    };
    
    // Listen for interim messages and voice cloning updates
    const handleMessage = (msg) => {
      if (msg.type === 'TRANSCRIPT_INTERIM') {
        setInterimTranscript(msg.data); // data is { text, mode } or null
      } else if (msg.type === 'VOICE_CLONE_STATUS') {
        setVoiceCloneStatus(msg.status);
        setVoiceCloneMessage(msg.message || '');
      } else if (msg.type === 'VOICE_MODEL_AVAILABLE') {
        setHasVoiceModel(true);
        setCurrentVoiceModel(msg.data);
        setVoiceCloneStatus('ready');
        setVoiceCloneMessage(`Voice cloned from ${msg.data.hostname}`);
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
  
  const handleToggleClonedVoice = () => {
    const newValue = !useClonedVoice;
    setUseClonedVoice(newValue);
    
    // Send message to offscreen to update TTS service
    chrome.runtime.sendMessage({
      type: 'SET_USE_CLONED_VOICE',
      useClonedVoice: newValue,
      modelId: currentVoiceModel?.model_id,
      fishApiKey: fishApiKey // Pass the API key
    }).catch(err => console.error('Failed to set voice:', err));
  };
  
  const handleSaveApiKey = () => {
    if (fishApiKey.trim()) {
      chrome.storage.local.set({ fishApiKey: fishApiKey.trim() }, () => {
        console.log('[Popup] Fish API key saved');
        setShowApiKeyInput(false);
        
        // Send to offscreen if it's running
        chrome.runtime.sendMessage({
          type: 'UPDATE_FISH_API_KEY',
          fishApiKey: fishApiKey.trim()
        }).catch(() => {
          // Offscreen might not be running, that's okay
        });
      });
    }
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
      
      {/* Voice Cloning Section */}
      <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-cyan-400">🎤 Voice Cloning</span>
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="text-xs text-gray-400 hover:text-cyan-400"
              title="Configure Fish Audio API Key"
            >
              ⚙️
            </button>
            {voiceCloneStatus === 'capturing' && (
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
            )}
            {voiceCloneStatus === 'processing' && (
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            )}
            {voiceCloneStatus === 'ready' && (
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            )}
            {voiceCloneStatus === 'error' && (
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            )}
          </div>
          
          {/* Toggle switch for cloned voice */}
          {hasVoiceModel && (
            <button
              onClick={handleToggleClonedVoice}
              disabled={status !== 'translating'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useClonedVoice ? 'bg-cyan-600' : 'bg-gray-600'
              } ${status !== 'translating' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useClonedVoice ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>
        
        <div className="text-xs text-gray-400">
          {voiceCloneStatus === 'idle' && !hasVoiceModel && (
            <p>Start translation to clone speaker voice</p>
          )}
          {voiceCloneStatus === 'capturing' && (
            <p className="text-yellow-400">⏺ Capturing voice... (10 seconds)</p>
          )}
          {voiceCloneStatus === 'processing' && (
            <p className="text-blue-400">⚙️ {voiceCloneMessage || 'Creating voice model...'}</p>
          )}
          {voiceCloneStatus === 'ready' && hasVoiceModel && (
            <div>
              <p className="text-green-400 mb-1">
                ✓ Voice cloned from {currentVoiceModel?.hostname || 'this page'}
              </p>
              <p className="text-gray-500">
                {useClonedVoice ? '🔊 Using cloned voice' : '🔇 Using default voice'}
              </p>
              {!fishApiKey && useClonedVoice && (
                <p className="text-yellow-400 mt-1">
                  ⚠️ Fish API key required - click ⚙️ to add
                </p>
              )}
            </div>
          )}
          {voiceCloneStatus === 'error' && (
            <p className="text-red-400">⚠️ {voiceCloneMessage || 'Failed to clone voice'}</p>
          )}
        </div>
        
        {/* API Key Input (collapsible) */}
        {showApiKeyInput && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <label className="text-xs text-gray-400 mb-1 block">
              Fish Audio API Key:
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={fishApiKey}
                onChange={(e) => setFishApiKey(e.target.value)}
                placeholder="Enter your Fish API key..."
                className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-cyan-500 focus:outline-none"
              />
              <button
                onClick={handleSaveApiKey}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-3 py-1 rounded transition"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get your key from{' '}
              <a 
                href="https://fish.audio" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                fish.audio
              </a>
            </p>
          </div>
        )}
      </div>

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

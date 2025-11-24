import { useState, useEffect } from "react";
import { FileText, Mic, StickyNote } from "lucide-react";

import "./index.css";
import { FloatingOverlay } from "./components/FloatingOverlay";
import { LiveTranscript } from "./components/LiveTranscript";
import { NotesSummary } from "./components/NotesSummary";
import { PopupHome } from "./components/PopupHome";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [isTranslating, setIsTranslating] = useState(false);
  const [showFloatingOverlay, setShowFloatingOverlay] = useState(false);
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
    
    window.addEventListener("showNotesTab", handleShowNotes);
    return () => {
      window.removeEventListener("showNotesTab", handleShowNotes);
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
    <div className="min-h-screen bg-[#FAFAFA] relative">
      <style>{`
        :root {
          --whismur-primary: #4C6FFF;
          --whismur-secondary: #00C4A7;
          --whismur-text-primary: #1A1A1A;
          --whismur-text-secondary: #3D3D3D;
          --whismur-bg-card: #F6F8FB;
        }

        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #F6F8FB;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb {
          background: #4C6FFF;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #3D5FEE;
        }
      `}</style>

      <div className="mx-auto py-4 px-2" style={{ maxWidth: "340px" }}>
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-[#4C6FFF] to-[#6B5AFE] px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-white" style={{ fontSize: "20px", fontWeight: 600 }}>
                    Whismur AI
                  </h1>
                  <p className="text-white/70" style={{ fontSize: "12px" }}>
                    Real-time Translation
                  </p>
                </div>
              </div>
            </div>
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3 bg-[#F6F8FB] p-1 rounded-none">
              <TabsTrigger
                value="home"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"
              >
                <Mic className="w-4 h-4 mr-2" />
                Control
              </TabsTrigger>
              <TabsTrigger
                value="transcript"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"
              >
                <FileText className="w-4 h-4 mr-2" />
                Transcript
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"
              >
                <StickyNote className="w-4 h-4 mr-2" />
                Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="m-0">
              <PopupHome
                isTranslating={isTranslating}
                setIsTranslating={setIsTranslating}
                transcripts={transcripts}
                setTranscripts={setTranscripts}
                setShowFloatingOverlay={setShowFloatingOverlay}
              />
            </TabsContent>

            <TabsContent value="transcript" className="m-0">
              <LiveTranscript 
                isTranslating={isTranslating} 
                transcripts={transcripts}
                setTranscripts={setTranscripts}
              />
            </TabsContent>

            <TabsContent value="notes" className="m-0">
              <NotesSummary isTranslating={isTranslating} transcripts={transcripts} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {showFloatingOverlay && <FloatingOverlay onClose={() => setShowFloatingOverlay(false)} />}
    </div>
  );
}

export default App;

import { useState, useEffect } from "react";
import { FileText, Mic, StickyNote } from "lucide-react";

import "./index.css";
import { LiveTranscript } from "./components/LiveTranscript";
import { NotesSummary } from "./components/NotesSummary";
import { PopupHome } from "./components/PopupHome";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [isTranslating, setIsTranslating] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  
  // Load cached transcripts on mount
  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.local.get(["cachedTranscripts"], (result) => {
        if (result.cachedTranscripts && Array.isArray(result.cachedTranscripts)) {
          setTranscripts(result.cachedTranscripts);
        }
      });
    }
  }, []);
  
  // Listen for custom event to switch to notes tab
  useEffect(() => {
    const handleShowNotes = () => {
      setActiveTab("notes");
    };
    
    window.addEventListener("showNotesTab", handleShowNotes);
    return () => {
      window.removeEventListener("showNotesTab", handleShowNotes);
    };
  }, []);

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

      <div className="mx-auto py-1 px-1" style={{ maxWidth: "220px" }}>
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-[#4C6FFF] to-[#6B5AFE] px-3 py-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <Mic className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h1 className="text-white" style={{ fontSize: "16px", fontWeight: 600 }}>
                    Whismur AI
                  </h1>
                  <p className="text-white/70" style={{ fontSize: "10px" }}>
                    Real-time Translation
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3 bg-[#F6F8FB] p-0.5 rounded-none">
              <TabsTrigger
                value="home"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs"
              >
                <Mic className="w-3 h-3 mr-1" />
                Control
              </TabsTrigger>
              <TabsTrigger
                value="transcript"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs"
              >
                <FileText className="w-3 h-3 mr-1" />
                Transcript
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs"
              >
                <StickyNote className="w-3 h-3 mr-1" />
                Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="m-0">
              <PopupHome
                isTranslating={isTranslating}
                setIsTranslating={setIsTranslating}
                transcripts={transcripts}
                setTranscripts={setTranscripts}
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
    </div>
  );
}

export default App;
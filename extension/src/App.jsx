import { useState } from "react";
import { FileText, Mic, StickyNote } from "lucide-react";

import "./index.css";
import { LiveTranscript } from "./components/LiveTranscript";
import { NotesSummary } from "./components/NotesSummary";
import { PopupHome } from "./components/PopupHome";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [isTranslating, setIsTranslating] = useState(false);

  return (
    <div className="h-full bg-[#FAFAFA] relative overflow-hidden">
      <style>{`
        :root {
          --whismur-primary: #4C6FFF;
          --whismur-secondary: #00C4A7;
          --whismur-text-primary: #1A1A1A;
          --whismur-text-secondary: #3D3D3D;
          --whismur-bg-card: #F6F8FB;
        }
      `}</style>

      <div className="mx-auto px-2 pt-4 pb-4" style={{ maxWidth: "340px" }}>
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
              />
            </TabsContent>

            <TabsContent value="transcript" className="m-0">
              <LiveTranscript isTranslating={isTranslating} />
            </TabsContent>

            <TabsContent value="notes" className="m-0">
              <NotesSummary isTranslating={isTranslating} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

    </div>
  );
}

export default App;
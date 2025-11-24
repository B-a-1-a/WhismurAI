import { useEffect, useRef, useState } from "react";
import { Columns2, Copy, Download, FileText } from "lucide-react";

import { TranscriptBubble } from "./TranscriptBubble";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

const MOCK_TRANSCRIPTS = [
  {
    id: "1",
    speaker: "Speaker A",
    timestamp: "00:12",
    original: "Hello everyone, welcome to today's presentation.",
    translated: "Hola a todos, bienvenidos a la presentación de hoy.",
  },
  {
    id: "2",
    speaker: "Speaker B",
    timestamp: "00:18",
    original: "Thank you for having me. I'm excited to share our progress.",
    translated: "Gracias por recibirme. Estoy emocionado de compartir nuestro progreso.",
  },
  {
    id: "3",
    speaker: "Speaker A",
    timestamp: "00:25",
    original: "Let's start with the key highlights from this quarter.",
    translated: "Empecemos con los aspectos destacados clave de este trimestre.",
  },
];

export function LiveTranscript({ isTranslating, targetLang }) {
  const [viewMode, setViewMode] = useState("dual");
  const [transcripts, setTranscripts] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState(null);
  const scrollRef = useRef(null);

  // Language name mapping
  const languageNames = {
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ko': 'Korean',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ar': 'Arabic',
    'en': 'English'
  };

  useEffect(() => {
    // Load transcripts from storage
    chrome.storage.local.get(['transcripts'], (result) => {
      if (result.transcripts) {
        setTranscripts(result.transcripts.map((t, i) => ({
          id: `transcript-${i}`,
          timestamp: new Date(t.timestamp).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          }),
          original: t.original,
          translated: t.translation
        })));
      }
    });

    // Listen for transcript updates
    const handleStorageChange = (changes) => {
      if (changes.transcripts) {
        const newTranscripts = changes.transcripts.newValue || [];
        setTranscripts(newTranscripts.map((t, i) => ({
          id: `transcript-${i}`,
          timestamp: new Date(t.timestamp).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          }),
          original: t.original,
          translated: t.translation
        })));
      }
    };

    // Listen for interim transcripts
    const handleMessage = (msg) => {
      if (msg.type === 'TRANSCRIPT_INTERIM') {
        setInterimTranscript(msg.data); // { text, mode } or null
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  const serializeTranscript = () =>
    transcripts
      .map(
        (entry) =>
          `[${entry.timestamp}] ${entry.speaker}\nOriginal: ${entry.original}\nTranslated: ${entry.translated}\n`,
      )
      .join("\n");

  const handleCopyTranscript = async () => {
    const text = serializeTranscript();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Ignore clipboard errors in unsupported contexts
    }
  };

  const handleDownloadTranscript = () => {
    const text = serializeTranscript();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "whismur-transcript.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[420px]">
      <div className="px-4 py-3 border-b border-gray-200 bg-[#F6F8FB]">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={viewMode === "transcript" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("transcript")}
              className="rounded-lg h-8"
            >
              <FileText className="w-3 h-3 mr-1" />
              Transcript Only
            </Button>
            <Button
              variant={viewMode === "dual" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("dual")}
              className="rounded-lg h-8"
            >
              <Columns2 className="w-3 h-3 mr-1" />
              Dual View
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyTranscript}
              disabled={transcripts.length === 0}
              className="rounded-lg h-8"
            >
              <Copy className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadTranscript}
              disabled={transcripts.length === 0}
              className="rounded-lg h-8"
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-3">
          {transcripts.length === 0 && !interimTranscript ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <div className="w-16 h-16 bg-[#F6F8FB] rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-[#9CA3AF]" />
              </div>
              <h3 className="text-[#1A1A1A] mb-2">No Transcript Yet</h3>
              <p className="text-[#9CA3AF]" style={{ fontSize: "14px" }}>
                Start translation to see live transcripts appear here
              </p>
            </div>
          ) : (
            <>
              {transcripts.map((entry) => (
                <TranscriptBubble key={entry.id} transcript={entry} viewMode={viewMode} targetLang={targetLang} languageNames={languageNames} />
              ))}
              {interimTranscript && (
                <div className="opacity-75 animate-pulse">
                  <TranscriptBubble 
                    transcript={{
                      id: 'interim',
                      timestamp: '...',
                      original: interimTranscript.mode === 'original' ? interimTranscript.text : '',
                      translated: interimTranscript.mode === 'translation' ? interimTranscript.text : '',
                      isInterim: true
                    }} 
                    viewMode={viewMode} 
                    targetLang={targetLang}
                    languageNames={languageNames}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


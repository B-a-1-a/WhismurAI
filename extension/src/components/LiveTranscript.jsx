import { useEffect, useState } from "react";
import { Copy, Download, FileText } from "lucide-react";

import { TranscriptBubble } from "./TranscriptBubble";
import { Button } from "./ui/button";

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

export function LiveTranscript({ isTranslating }) {
  const [transcripts, setTranscripts] = useState([]);

  useEffect(() => {
    if (!isTranslating) {
      setTranscripts([]);
      return;
    }

    const timers = [
      setTimeout(() => setTranscripts(MOCK_TRANSCRIPTS.slice(0, 1)), 1000),
      setTimeout(
        () =>
          setTranscripts((prev) => [...prev, { ...MOCK_TRANSCRIPTS[1], isNew: true }]),
        3000,
      ),
      setTimeout(
        () =>
          setTranscripts((prev) => [...prev, { ...MOCK_TRANSCRIPTS[2], isNew: true }]),
        5000,
      ),
    ];

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [isTranslating]);

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
    <div className="flex flex-col" style={{ height: "420px", minHeight: "420px" }}>
      <style>{`
        .transcript-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .transcript-scroll-container::-webkit-scrollbar-track {
          background: #F6F8FB;
          border-radius: 10px;
        }
        .transcript-scroll-container::-webkit-scrollbar-thumb {
          background: #4C6FFF;
          border-radius: 10px;
        }
        .transcript-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #3D5FEE;
        }
      `}</style>
      <div className="px-4 py-3 border-b border-gray-200 bg-[#F6F8FB] flex-shrink-0">
        <div className="flex items-center justify-end">
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

      <div 
        className="overflow-y-auto transcript-scroll-container flex-1 min-h-0"
        style={{ maxHeight: "100%" }}
      >
        <div className="p-4 space-y-3">
          {transcripts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-[#F6F8FB] rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-[#9CA3AF]" />
              </div>
              <h3 className="text-[#1A1A1A] mb-2">No Transcript Yet</h3>
              <p className="text-[#9CA3AF]" style={{ fontSize: "14px" }}>
                Start translation to see live transcripts appear here
              </p>
            </div>
          ) : (
            transcripts.map((entry) => (
              <TranscriptBubble key={entry.id} transcript={entry} viewMode="dual" />
            ))
          )}
        </div>
      </div>
    </div>
  );
}


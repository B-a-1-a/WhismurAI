import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileText } from "lucide-react";

import { TranscriptBubble } from "./TranscriptBubble";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

// Format text with proper sentence capitalization and punctuation
function formatSentence(text) {
  if (!text || text.trim().length === 0) return text;
  
  // Trim whitespace
  let formatted = text.trim();
  
  // Capitalize first letter
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  
  // Ensure sentence ends with punctuation
  if (!/[.!?]$/.test(formatted)) {
    formatted += ".";
  }
  
  // Fix multiple spaces
  formatted = formatted.replace(/\s+/g, " ");
  
  // Fix spacing around punctuation
  formatted = formatted.replace(/\s+([,.!?])/g, "$1");
  formatted = formatted.replace(/([,.!?])([^\s])/g, "$1 $2");
  
  return formatted;
}

export function LiveTranscript({ isTranslating, transcripts, setTranscripts }) {
  const scrollRef = useRef(null);
  const transcriptIdCounter = useRef(0);
  const currentText = useRef("");

  // Load cached transcripts on mount
  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.local.get(["cachedTranscripts", "transcriptCounter"], (result) => {
        if (result.cachedTranscripts && Array.isArray(result.cachedTranscripts)) {
          setTranscripts(result.cachedTranscripts);
          if (result.transcriptCounter) {
            transcriptIdCounter.current = result.transcriptCounter;
          }
        }
      });
    }
  }, []);

  // Cache transcripts whenever they change
  useEffect(() => {
    if (chrome.storage && transcripts.length > 0) {
      chrome.storage.local.set({ 
        cachedTranscripts: transcripts,
        transcriptCounter: transcriptIdCounter.current
      });
    }
  }, [transcripts]);

  // Listen for transcript messages from backend (English only)
  useEffect(() => {
    if (!isTranslating) {
      // Don't clear transcripts when stopping - keep them cached
      currentText.current = "";
      return;
    }

    const messageListener = (message, sender, sendResponse) => {
      if (message.type === "TRANSCRIPT_UPDATE" && message.data) {
        const { mode, text } = message.data;
        
        // Only process original/English transcripts
        if (mode === "original" && text && text.trim().length > 0) {
          // Format the sentence
          const formattedText = formatSentence(text);
          
          // Create a new transcript entry for each sentence
          const newTranscript = {
            id: `transcript-${transcriptIdCounter.current++}`,
            speaker: "Speaker",
            timestamp: new Date().toLocaleTimeString('en-US', { 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit'
            }),
            text: formattedText,
            isNew: true
          };
          
          setTranscripts((prev) => [...prev, newTranscript]);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [isTranslating]);

  useEffect(() => {
    // Auto-scroll to bottom when new transcripts are added
    const scrollToBottom = () => {
      if (scrollRef.current) {
        // Try to find the scroll viewport element
        const viewport = scrollRef.current.closest('[data-radix-scroll-area-viewport]') || 
                        scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') ||
                        scrollRef.current.parentElement?.querySelector('[data-radix-scroll-area-viewport]');
        
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        } else {
          // Fallback: scroll the ref element itself
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }
    };
    
    // Use setTimeout to ensure DOM is updated
    setTimeout(scrollToBottom, 100);
  }, [transcripts]);

  const serializeTranscript = () =>
    transcripts
      .map(
        (entry) =>
          `[${entry.timestamp}] ${entry.speaker}\n${entry.text}\n`,
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
      <div className="px-5 py-3.5 border-b border-gray-200 bg-[#F6F8FB]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#4C6FFF]" />
            <span className="text-[#1A1A1A]" style={{ fontSize: "14px", fontWeight: 600 }}>
              Transcript
            </span>
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
        <div 
          ref={scrollRef} 
          className="p-5 space-y-4"
          style={{ 
            display: 'flex', 
            flexDirection: 'column',
            minHeight: '100%'
          }}
        >
          {transcripts.length === 0 ? (
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
            transcripts.map((entry) => (
              <TranscriptBubble key={entry.id} transcript={entry} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


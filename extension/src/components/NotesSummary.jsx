import { useState, useEffect } from "react";
import { CheckCircle2, RefreshCw, Sparkles, StickyNote } from "lucide-react";

import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";

export function NotesSummary({ isTranslating, transcripts }) {
  const [hasSummary, setHasSummary] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userNotes, setUserNotes] = useState("");
  const [summaryData, setSummaryData] = useState(null);
  
  // Load cached summary from storage when component mounts
  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.local.get(["lastSummary", "summaryTimestamp"], (result) => {
        if (result.lastSummary) {
          setSummaryData(result.lastSummary);
          setHasSummary(true);
        }
      });
    }
  }, []);
  
  // Also check when transcripts change (in case summary was just generated)
  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.local.get(["lastSummary"], (result) => {
        if (result.lastSummary && !hasSummary) {
          setSummaryData(result.lastSummary);
          setHasSummary(true);
        }
      });
    }
  }, [transcripts, hasSummary]);

  const handleGenerateSummary = async () => {
    if (!transcripts || transcripts.length === 0) return;
    
    setIsGenerating(true);
    try {
      const transcriptTexts = transcripts.map(t => t.text || t.original || t).filter(t => t && t.trim());
      if (transcriptTexts.length === 0) {
        setIsGenerating(false);
        return;
      }
      
      const response = await fetch("http://localhost:8000/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcripts: transcriptTexts }),
      });
      
      if (response.ok) {
        const summary = await response.json();
        setSummaryData(summary);
        setHasSummary(true);
        // Store in chrome.storage with timestamp for caching
        if (chrome.storage) {
          chrome.storage.local.set({ 
            lastSummary: summary,
            summaryTimestamp: Date.now()
          });
        }
      } else {
        console.error("Failed to generate summary");
      }
    } catch (error) {
      console.error("Error generating summary:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyNotes = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(userNotes);
      }
    } catch {
      // Swallow clipboard errors for unsupported contexts
    }
  };

  return (
    <ScrollArea className="h-[420px]">
      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#4C6FFF]" />
              <h3 className="text-[#1A1A1A]">AI Summary</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateSummary}
              disabled={(!transcripts || transcripts.length === 0) || isGenerating}
              className="rounded-lg h-8"
            >
              <RefreshCw className={`w-3 h-3 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
              {hasSummary ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {hasSummary && summaryData ? (
            <div className="bg-gradient-to-br from-[#4C6FFF]/5 to-[#00C4A7]/5 rounded-xl p-4 border border-[#4C6FFF]/20 space-y-4">
              <div>
                <h4 className="text-[#1A1A1A] mb-2" style={{ fontSize: "15px", fontWeight: 600 }}>
                  Session Summary
                </h4>
                <p className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                  {summaryData.summary || "No summary available."}
                </p>
              </div>

              {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 bg-[#4C6FFF] rounded-full" />
                    <span className="text-[#1A1A1A]" style={{ fontSize: "13px", fontWeight: 600 }}>
                      Key Points
                    </span>
                  </div>
                  <ul className="space-y-2 ml-4">
                    {summaryData.keyPoints.map((point, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#00C4A7] mt-0.5 flex-shrink-0" />
                        <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summaryData.actionItems && summaryData.actionItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 bg-[#00C4A7] rounded-full" />
                    <span className="text-[#1A1A1A]" style={{ fontSize: "13px", fontWeight: 600 }}>
                      Action Items
                    </span>
                  </div>
                  <ul className="space-y-2 ml-4">
                    {summaryData.actionItems.map((item, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-4 h-4 border-2 border-[#4C6FFF] rounded mt-0.5 flex-shrink-0" />
                        <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#F6F8FB] rounded-xl p-8 text-center border-2 border-dashed border-gray-200">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 text-[#9CA3AF]" />
              </div>
              <h4 className="text-[#1A1A1A] mb-2">No Summary Yet</h4>
              <p className="text-[#9CA3AF]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                Start a translation session, then click Generate to create an AI-powered summary
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-[#00C4A7]" />
            <h3 className="text-[#1A1A1A]">Your Notes</h3>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Textarea
              value={userNotes}
              onChange={(event) => setUserNotes(event.target.value)}
              placeholder="Add your personal notes here... You can edit or expand on the AI summary."
              className="min-h-[200px] border-0 focus-visible:ring-0 resize-none"
              style={{ fontSize: "13px" }}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={copyNotes}
              disabled={!userNotes}
            >
              Copy Notes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setUserNotes("")}
              disabled={!userNotes}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="bg-[#F6F8FB] rounded-xl p-4 border border-gray-200">
          <p className="text-[#9CA3AF]" style={{ fontSize: "12px", lineHeight: 1.6 }}>
            💡 <span className="text-[#3D3D3D]">Tip:</span> The AI summary is generated from your
            transcript. You can regenerate it at any time to get updated insights.
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}


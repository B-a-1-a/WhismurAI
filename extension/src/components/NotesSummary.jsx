import { useState } from "react";
import { CheckCircle2, RefreshCw, Sparkles, StickyNote } from "lucide-react";

import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";

export function NotesSummary({ isTranslating }) {
  const [hasSummary, setHasSummary] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userNotes, setUserNotes] = useState("");

  const handleGenerateSummary = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setHasSummary(true);
    }, 2000);
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
              disabled={!isTranslating && !hasSummary}
              className="rounded-lg h-8"
            >
              <RefreshCw className={`w-3 h-3 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
              {hasSummary ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {hasSummary ? (
            <div className="bg-gradient-to-br from-[#4C6FFF]/5 to-[#00C4A7]/5 rounded-xl p-4 border border-[#4C6FFF]/20 space-y-4">
              <div>
                <h4 className="text-[#1A1A1A] mb-2" style={{ fontSize: "15px", fontWeight: 600 }}>
                  Session Summary
                </h4>
                <p className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                  A presentation discussing quarterly highlights and progress updates. Two speakers
                  shared insights about recent developments and key achievements.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-[#4C6FFF] rounded-full" />
                  <span className="text-[#1A1A1A]" style={{ fontSize: "13px", fontWeight: 600 }}>
                    Key Points
                  </span>
                </div>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#00C4A7] mt-0.5 flex-shrink-0" />
                    <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                      Welcome and introduction to the presentation
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#00C4A7] mt-0.5 flex-shrink-0" />
                    <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                      Shared progress updates from the team
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#00C4A7] mt-0.5 flex-shrink-0" />
                    <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                      Focus on quarterly highlights and achievements
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-[#00C4A7] rounded-full" />
                  <span className="text-[#1A1A1A]" style={{ fontSize: "13px", fontWeight: 600 }}>
                    Action Items
                  </span>
                </div>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <div className="w-4 h-4 border-2 border-[#4C6FFF] rounded mt-0.5 flex-shrink-0" />
                    <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                      Review quarterly highlights in detail
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-4 h-4 border-2 border-[#4C6FFF] rounded mt-0.5 flex-shrink-0" />
                    <span className="text-[#3D3D3D]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                      Follow up on discussed progress items
                    </span>
                  </li>
                </ul>
              </div>
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


import { useState } from "react";
import { FileText, Maximize2, Minimize2, Volume2, X } from "lucide-react";

import { Button } from "./ui/button";

export function FloatingOverlay({ onClose }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState("live");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const currentText =
    "Let's start with the key highlights from this quarter. We've made significant progress...";

  const handleMouseDown = (event) => {
    setIsDragging(true);
    setDragStart({
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    });
  };

  const handleMouseMove = (event) => {
    if (!isDragging) return;
    setPosition({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} className="fixed inset-0 z-50 pointer-events-none">
      <div
        className={`absolute pointer-events-auto transition-all duration-300 ${
          isExpanded ? "w-[500px]" : "w-[350px]"
        }`}
        style={{
          left: `calc(50% + ${position.x}px)`,
          top: `calc(50% + ${position.y}px)`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#4C6FFF] to-[#6B5AFE] px-4 py-3 cursor-move"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#00C4A7] rounded-full animate-pulse" />
                <span className="text-white" style={{ fontSize: "13px", fontWeight: 600 }}>
                  Live Translation
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="h-7 w-7 p-0 hover:bg-white/20 text-white"
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-7 w-7 p-0 hover:bg-white/20 text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 bg-[#F6F8FB] flex gap-1">
            <Button
              variant={mode === "transcript" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("transcript")}
              className="h-7 rounded-lg flex-1"
            >
              <FileText className="w-3 h-3 mr-1" />
              Transcript
            </Button>
            <Button
              variant={mode === "listen" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("listen")}
              className="h-7 rounded-lg flex-1"
            >
              <Volume2 className="w-3 h-3 mr-1" />
              Listen
            </Button>
            <Button
              variant={mode === "live" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("live")}
              className="h-7 rounded-lg flex-1"
            >
              <div className="w-2 h-2 bg-[#00C4A7] rounded-full mr-1" />
              Live
            </Button>
          </div>

          <div className="p-4">
            {!isExpanded ? (
              <div className="relative overflow-hidden h-6">
                <div className="whitespace-nowrap animate-scroll">
                  <span className="text-[#1A1A1A]" style={{ fontSize: "14px" }}>
                    {currentText}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                <div className="bg-[#F6F8FB] rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-[#4C6FFF]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#4C6FFF]" style={{ fontSize: "11px", fontWeight: 600 }}>
                        A
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[#1A1A1A]" style={{ fontSize: "12px", fontWeight: 600 }}>
                          Speaker A
                        </span>
                        <span className="text-[#9CA3AF]" style={{ fontSize: "11px" }}>
                          00:25
                        </span>
                      </div>
                      <p className="text-[#1A1A1A]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                        Empecemos con los aspectos destacados clave de este trimestre.
                      </p>
                      <p className="text-[#9CA3AF] italic mt-1" style={{ fontSize: "11px" }}>
                        Let's start with the key highlights from this quarter.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#F6F8FB] rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#00C4A7]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#00C4A7]" style={{ fontSize: "11px", fontWeight: 600 }}>
                        B
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[#1A1A1A]" style={{ fontSize: "12px", fontWeight: 600 }}>
                          Speaker B
                        </span>
                        <span className="text-[#9CA3AF]" style={{ fontSize: "11px" }}>
                          00:18
                        </span>
                      </div>
                      <p className="text-[#1A1A1A]" style={{ fontSize: "13px", lineHeight: 1.5 }}>
                        Gracias por recibirme. Estoy emocionado de compartir nuestro progreso.
                      </p>
                      <p className="text-[#9CA3AF] italic mt-1" style={{ fontSize: "11px" }}>
                        Thank you for having me. I'm excited to share our progress.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!isExpanded && (
            <div className="px-4 pb-3 text-center">
              <span className="text-[#9CA3AF]" style={{ fontSize: "11px" }}>
                Drag to reposition • Click expand for full view
              </span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 10s linear infinite;
        }
      `}</style>
    </div>
  );
}


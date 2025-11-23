import { Avatar, AvatarFallback } from "./ui/avatar";

export function TranscriptBubble({ transcript, viewMode }) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl transition-all duration-300 ${
        transcript.isNew
          ? "bg-[#4C6FFF]/10 border border-[#4C6FFF]/20"
          : "bg-[#F6F8FB] hover:bg-[#EEF2F7]"
      }`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarFallback className="bg-[#4C6FFF] text-white" style={{ fontSize: "12px" }}>
          {transcript.speaker?.[0] ?? "?"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#1A1A1A]" style={{ fontSize: "13px", fontWeight: 600 }}>
            {transcript.speaker}
          </span>
          <span className="text-[#9CA3AF]" style={{ fontSize: "11px" }}>
            {transcript.timestamp}
          </span>
          {transcript.isNew && <div className="w-2 h-2 bg-[#00C4A7] rounded-full animate-pulse" />}
        </div>

        {viewMode === "dual" ? (
          <div className="space-y-2">
            <p className="text-[#1A1A1A]" style={{ fontSize: "14px", lineHeight: 1.6 }}>
              {transcript.original}
            </p>
            <p
              className="text-[#9CA3AF] italic"
              style={{ fontSize: "13px", lineHeight: 1.6 }}
            >
              {transcript.translated}
            </p>
          </div>
        ) : (
          <p className="text-[#1A1A1A]" style={{ fontSize: "14px", lineHeight: 1.6 }}>
            {transcript.translated}
          </p>
        )}
      </div>
    </div>
  );
}


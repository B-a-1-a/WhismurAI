import { useMemo, useState } from "react";
import { Mic, Square, Play } from "lucide-react";

import { AudioWaveform } from "./AudioWaveform";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English", code: "en" },
  { value: "spanish", label: "Spanish", code: "es" },
  { value: "japanese", label: "Japanese", code: "ja" },
  { value: "korean", label: "Korean", code: "ko" },
  { value: "chinese", label: "Chinese", code: "zh" },
  { value: "french", label: "French", code: "fr" },
  { value: "german", label: "German", code: "de" },
  { value: "arabic", label: "Arabic", code: "ar" },
];

const STATUS_CONFIG = {
  idle: { color: "#9CA3AF", text: "Waiting for audio..." },
  listening: { color: "#00C4A7", text: "Listening..." },
  processing: { color: "#F59E0B", text: "Processing..." },
  translating: { color: "#4C6FFF", text: "Translating..." },
};

function emitRuntimeMessage(payload) {
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(payload);
  }
}

export function PopupHome({ isTranslating, setIsTranslating, setShowFloatingOverlay }) {
  const [status, setStatus] = useState("idle");
  const [inputSource, setInputSource] = useState("microphone");
  const [targetLanguage, setTargetLanguage] = useState("english");
  const [audioMode, setAudioMode] = useState("translated");
  const [useVoiceClone, setUseVoiceClone] = useState(false);

  const statusStyles = STATUS_CONFIG[status];
  const targetLangCode = useMemo(() => {
    const match = LANGUAGE_OPTIONS.find((lang) => lang.value === targetLanguage);
    return match ? match.code : targetLanguage;
  }, [targetLanguage]);

  const handleStartTranslation = () => {
    setIsTranslating(true);
    setStatus("listening");
    setShowFloatingOverlay(true);

    emitRuntimeMessage({ action: "START_SESSION", targetLang: targetLangCode, inputSource });

    setTimeout(() => setStatus("processing"), 2000);
    setTimeout(() => setStatus("translating"), 4000);
  };

  const handleStopTranslation = () => {
    setIsTranslating(false);
    setStatus("idle");
    setShowFloatingOverlay(false);
    emitRuntimeMessage({ action: "STOP_SESSION" });
  };

  return (
    <div className="p-5 space-y-5">
      <div className="bg-[#F6F8FB] rounded-xl p-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className="w-3 h-3 rounded-full transition-all duration-300"
              style={{ backgroundColor: statusStyles.color }}
            />
            {status !== "idle" && (
              <div
                className="absolute inset-0 w-3 h-3 rounded-full animate-ping"
                style={{ backgroundColor: statusStyles.color, opacity: 0.6 }}
              />
            )}
          </div>
          <span className="text-[#3D3D3D]" style={{ fontSize: "14px" }}>
            {statusStyles.text}
          </span>
        </div>

        {status !== "idle" && (
          <div className="mt-2">
            <AudioWaveform isActive color={statusStyles.color} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="input-source" className="text-[#1A1A1A]">
          Select Input Source
        </Label>
        <Select value={inputSource} onValueChange={setInputSource}>
          <SelectTrigger
            id="input-source"
            className="bg-[#F6F8FB] border-none rounded-xl h-12 shadow-sm"
          >
            <SelectValue placeholder="Choose source" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="microphone" className="rounded-lg">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4" />
                <span>Microphone</span>
              </div>
            </SelectItem>
            <SelectItem value="this-tab" className="rounded-lg">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                <span>This Tab</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target-language" className="text-[#1A1A1A]">
          Target Language
        </Label>
        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger
            id="target-language"
            className="bg-[#F6F8FB] border-none rounded-xl h-12 shadow-sm"
          >
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent className="rounded-xl max-h-[250px]">
            {LANGUAGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="rounded-lg">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 bg-[#F6F8FB] rounded-xl p-3.5">
        <div className="space-y-2">
          <Label className="text-[#3D3D3D]">Audio Playback</Label>
          <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setAudioMode("original")}
              className={`flex-1 py-2 px-3 rounded-md transition-all duration-200 ${
                audioMode === "original"
                  ? "bg-[#4C6FFF] text-white shadow-md"
                  : "text-[#9CA3AF] hover:text-[#3D3D3D]"
              }`}
              style={{ fontSize: "13px", fontWeight: 600 }}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setAudioMode("translated")}
              className={`flex-1 py-2 px-3 rounded-md transition-all duration-200 ${
                audioMode === "translated"
                  ? "bg-[#4C6FFF] text-white shadow-md"
                  : "text-[#9CA3AF] hover:text-[#3D3D3D]"
              }`}
              style={{ fontSize: "13px", fontWeight: 600 }}
            >
              Translated
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <Label htmlFor="voice-clone" className="text-[#3D3D3D] cursor-pointer">
              Use Original Speaker Voice
            </Label>
            <span className="text-[#9CA3AF]" style={{ fontSize: "12px" }}>
              AI Voice Cloning (Fish AI)
            </span>
          </div>
          <Switch
            id="voice-clone"
            checked={useVoiceClone}
            onCheckedChange={setUseVoiceClone}
            className="data-[state=checked]:bg-[#00C4A7]"
          />
        </div>
      </div>

      <div className="flex gap-3">
        {!isTranslating ? (
          <Button
            onClick={handleStartTranslation}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#4C6FFF] to-[#6B5AFE] hover:from-[#3D5FEE] hover:to-[#5C4BED] shadow-lg shadow-[#4C6FFF]/30 transition-all duration-300"
          >
            <Mic className="w-4 h-4 mr-2" />
            Start Translation
          </Button>
        ) : (
          <Button
            onClick={handleStopTranslation}
            variant="destructive"
            className="flex-1 h-12 rounded-xl shadow-lg"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        )}
      </div>

      <div className="text-center text-[#9CA3AF]" style={{ fontSize: "12px" }}>
        {isTranslating
          ? "Translation is active. Check the Transcript tab for live results."
          : "Select your preferences above and click Start Translation to begin."}
      </div>
    </div>
  );
}


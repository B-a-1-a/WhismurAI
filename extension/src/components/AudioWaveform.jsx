import { useEffect, useMemo, useState } from "react";

export function AudioWaveform({ isActive, color = "#4C6FFF" }) {
  const bars = useMemo(() => Array.from({ length: 40 }, (_, i) => i), []);
  const [heights, setHeights] = useState(() => bars.map(() => 4));

  useEffect(() => {
    if (!isActive) {
      setHeights(bars.map(() => 4));
      return undefined;
    }

    const interval = setInterval(() => {
      setHeights(bars.map(() => Math.random() * 40 + 10));
    }, 120);

    return () => clearInterval(interval);
  }, [bars, isActive]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-12">
      {bars.map((i) => (
        <div
          key={i}
          className="w-[2px] rounded-full transition-all duration-100"
          style={{
            backgroundColor: color,
            height: `${heights[i]}px`,
            opacity: isActive ? 0.8 : 0.3,
          }}
        />
      ))}
    </div>
  );
}


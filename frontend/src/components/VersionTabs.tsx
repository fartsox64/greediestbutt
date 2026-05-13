import type { GameVersion } from "../types";
import { VERSION_LABELS, VERSION_ORDER } from "../types";

interface Props {
  value: GameVersion;
  onChange: (v: GameVersion) => void;
}

export function VersionTabs({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 flex-wrap">
      {VERSION_ORDER.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={[
            "px-4 py-2 text-sm transition-colors border",
            v === value
              ? "bg-isaac-accent border-isaac-accent text-black font-bold"
              : "bg-transparent border-isaac-border text-isaac-muted hover:border-isaac-accent hover:text-isaac-text",
          ].join(" ")}
        >
          {VERSION_LABELS[v]}
        </button>
      ))}
    </div>
  );
}

import type { SortType } from "../types";

interface SortToggleProps {
  value: SortType;
  onChange: (s: SortType) => void;
}

export function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-isaac-muted text-xs uppercase tracking-widest">Sort by</span>
      <div className="flex border border-isaac-border">
        {(["score", "time"] as SortType[]).map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={[
              "px-4 py-1.5 text-sm capitalize transition-colors",
              s === value
                ? "bg-isaac-accent text-black font-bold"
                : "text-isaac-muted hover:text-isaac-text",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PageSizeSelectorProps {
  value: number;
  onChange: (n: number) => void;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export function PageSizeSelector({ value, onChange }: PageSizeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-isaac-muted text-xs uppercase tracking-widest">Per page</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-isaac-surface border border-isaac-border text-isaac-text text-sm px-2 py-1.5 focus:outline-none focus:border-isaac-accent"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

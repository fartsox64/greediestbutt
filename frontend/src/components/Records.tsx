import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fetchRecords } from "../api/client";
import type { GameVersion, RecordEntry } from "../types";
import { VERSION_LABELS, VERSION_ORDER } from "../types";

const FRAMES_TO_TIME = (frames: number): string => {
  const totalSeconds = Math.floor(frames / 30);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [h > 0 ? String(h).padStart(2, "0") : null, String(m).padStart(2, "0"), String(s).padStart(2, "0")].filter(Boolean);
  return parts.join(":");
};

interface Props {
  onPlayerClick: (steamId: string) => void;
  onEntryClick: (entryId: number) => void;
}

export function Records({ onPlayerClick, onEntryClick }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["records"],
    queryFn: fetchRecords,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">Loading records…</div>;
  }

  if (!data || data.records.length === 0) {
    return <div className="text-center py-16 text-isaac-muted text-sm">No records found.</div>;
  }

  const byVersion = VERSION_ORDER.reduce<Record<GameVersion, RecordEntry[]>>((acc, v) => {
    acc[v] = data.records.filter((r) => r.version === v);
    return acc;
  }, {} as Record<GameVersion, RecordEntry[]>);

  return (
    <div className="space-y-8">
      <h1 className="font-title text-isaac-accent text-sm tracking-wide uppercase">All-Time Records</h1>

      {VERSION_ORDER.filter((v) => byVersion[v].length > 0).map((version) => (
        <div key={version} className="space-y-2">
          <h2 className="text-xs uppercase tracking-widest text-isaac-muted border-b border-isaac-border pb-2">
            {VERSION_LABELS[version]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {byVersion[version].map((record) => {
              const valueLabel =
                record.sort_type === "time"
                  ? (record.time_taken != null ? FRAMES_TO_TIME(record.time_taken) : "—")
                  : (record.value != null ? record.value.toLocaleString() : "—");
              const playerLabel = record.player_name ?? `[${record.steam_id}]`;
              return (
                <div key={`${version}-${record.sort_type}`} className="border border-isaac-border bg-isaac-surface p-4 space-y-3">
                  <div className="text-xs uppercase tracking-widest text-isaac-muted">
                    {record.sort_type === "score" ? "Highest Score" : "Fastest Time"}
                  </div>
                  <div className="text-2xl font-mono tabular-nums font-bold text-isaac-gold">
                    {valueLabel}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      onClick={() => onPlayerClick(record.steam_id)}
                      className="text-isaac-text hover:text-isaac-accent transition-colors truncate"
                    >
                      {playerLabel}
                    </button>
                    <button
                      onClick={() => onEntryClick(record.entry_id)}
                      className="text-xs text-isaac-muted hover:text-isaac-accent transition-colors font-mono shrink-0 ml-2"
                    >
                      {format(parseISO(record.date), "MMM d, yyyy")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

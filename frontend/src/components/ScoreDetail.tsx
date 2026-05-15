import { useState } from "react";
import { format, parseISO } from "date-fns";
import type { EntryDetail } from "../types";
import { VERSION_LABELS } from "../types";
import { safeHttpsUrl } from "../utils";

interface Props {
  entry: EntryDetail;
  avatarUrl?: string;
  onPlayerClick: (steamId: string) => void;
  onBack: () => void;
}

export function ScoreDetail({ entry, avatarUrl, onPlayerClick, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTime = entry.sort_type === "time";
  const valueLabel = isTime
    ? (entry.time_taken != null ? formatFrames(entry.time_taken) : "—")
    : (entry.value != null ? entry.value.toLocaleString() : "—");

  const bonuses = [
    { label: "Stage",       value: entry.stage_bonus },
    { label: "Schwag",      value: entry.schwag_bonus },
    { label: "Blue Baby",   value: entry.bluebaby_bonus },
    { label: "Lamb",        value: entry.lamb_bonus },
    { label: "Mega Satan",  value: entry.megasatan_bonus },
    { label: "Rush",        value: entry.rush_bonus },
    { label: "Exploration", value: entry.exploration_bonus },
  ].filter((b) => b.value != null && b.value !== 0);

  const penalties = [
    { label: "Damage", value: entry.damage_penalty },
    { label: "Time",   value: entry.time_penalty },
    { label: "Item",   value: entry.item_penalty },
  ].filter((p) => p.value != null && p.value !== 0);

  const rankClass =
    entry.rank === 1 ? "text-isaac-gold" :
    entry.rank === 2 ? "text-gray-300" :
    entry.rank === 3 ? "text-amber-600" :
    "text-isaac-text";

  const playerLabel = entry.player_name ?? `[${entry.steam_id}]`;
  const avatarSrc = safeHttpsUrl(avatarUrl);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-isaac-muted hover:text-isaac-text transition-colors border border-isaac-border px-3 py-1.5"
        >
          ← Back
        </button>
        <button
          onClick={handleShare}
          className="text-xs px-3 py-1.5 border border-isaac-border text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
        >
          {copied ? "Copied!" : "Share"}
        </button>
      </div>

      <div className="border border-isaac-border bg-isaac-surface p-6 space-y-6">
        {/* Player + value header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              onClick={() => onPlayerClick(entry.steam_id)}
              className="flex items-center gap-2 text-lg font-semibold hover:text-isaac-accent transition-colors"
            >
              {avatarSrc && (
                <img
                  src={avatarSrc}
                  className="w-8 h-8 flex-shrink-0"
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <span>{playerLabel}</span>
              {entry.goal != null && entry.goal < 2 && (
                <span title="Died during run" className="text-red-500">💀</span>
              )}
            </button>
            <div className="text-xs text-isaac-muted mt-1.5 space-x-1.5">
              <span>{VERSION_LABELS[entry.version]}</span>
              <span>·</span>
              <span>{format(parseISO(entry.date), "MMMM d, yyyy")}</span>
              <span>·</span>
              <span className="capitalize">{entry.sort_type}</span>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-mono tabular-nums font-bold ${rankClass}`}>
              {valueLabel}
            </div>
            <div className={`text-sm mt-1 ${rankClass}`}>
              Rank #{entry.rank}
              {entry.total_entries != null && (
                <span className="text-isaac-muted"> of {entry.total_entries.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Run details */}
        {((entry.level != null && entry.level !== 0) || entry.time_taken != null) && (
          <div className="border-t border-isaac-border pt-5 flex gap-8 text-sm">
            {entry.level != null && entry.level !== 0 && (
              <div>
                <div className="text-isaac-muted text-xs uppercase tracking-wider mb-1">Floor</div>
                <div className="font-mono">{entry.level}</div>
              </div>
            )}
            {entry.time_taken != null && (
              <div>
                <div className="text-isaac-muted text-xs uppercase tracking-wider mb-1">Time</div>
                <div className="font-mono">{formatFrames(entry.time_taken)}</div>
              </div>
            )}
          </div>
        )}

        {/* Bonuses */}
        {bonuses.length > 0 && (
          <div className="border-t border-isaac-border pt-5">
            <div className="text-isaac-muted text-xs uppercase tracking-wider mb-2">Bonuses</div>
            <div className="space-y-1.5">
              {bonuses.map((b) => (
                <div key={b.label} className="flex justify-between gap-8 text-sm">
                  <span className="text-isaac-muted">{b.label}</span>
                  <span className="text-green-400 font-mono tabular-nums">+{b.value!.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Penalties */}
        {penalties.length > 0 && (
          <div className="border-t border-isaac-border pt-5">
            <div className="text-isaac-muted text-xs uppercase tracking-wider mb-2">Penalties</div>
            <div className="space-y-1.5">
              {penalties.map((p) => (
                <div key={p.label} className="flex justify-between gap-8 text-sm">
                  <span className="text-isaac-muted">{p.label}</span>
                  <span className="text-red-400 font-mono tabular-nums">−{p.value!.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatFrames(frames: number): string {
  const totalSeconds = Math.floor(frames / 30);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    hours > 0 ? String(hours).padStart(2, "0") : null,
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].filter(Boolean);
  return parts.join(":");
}

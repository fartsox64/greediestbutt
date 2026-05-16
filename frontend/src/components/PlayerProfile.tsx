import { useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import type { PlayerHiddenRun, PlayerRun, SortType, User } from "../types";
import { FollowButton } from "./FollowButton";

interface Props {
  steamId: string;
  playerName: string | null;
  sortType: SortType;
  entries: PlayerRun[];
  hiddenEntries?: PlayerHiddenRun[];
  onBack: () => void;
  avatarUrl?: string;
  currentUser: User | null;
  isFollowing: boolean;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
  onHide: (entryId: number) => void;
  onScoreClick: (entryId: number) => void;
  onDateClick: (date: string, rank: number) => void;
}

export function PlayerProfile({
  steamId,
  playerName,
  sortType,
  entries,
  hiddenEntries,
  onBack,
  avatarUrl,
  currentUser,
  isFollowing,
  onFollow,
  onUnfollow,
  onHide,
  onScoreClick,
  onDateClick,
}: Props) {
  const playerLabel = playerName ?? `[${steamId}]`;
  const mediumAvatarUrl = avatarUrl ? avatarUrl.replace(".jpg", "_medium.jpg") : undefined;
  const isSelf = currentUser?.steam_id === steamId;

  const firstPlaces = entries.filter((e) => e.rank === 1).length;
  const wins = entries.filter((e) => e.goal != null && e.goal > 1).length;
  const avgRank = entries.reduce((s, e) => s + e.rank, 0) / entries.length;
  const bestRank = Math.min(...entries.map((e) => e.rank));
  const streaks = computeStreaks(entries);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-xs text-isaac-muted hover:text-isaac-text transition-colors border border-isaac-border px-3 py-1.5 flex-shrink-0"
        >
          ← Back
        </button>
        {mediumAvatarUrl && (
          <img
            src={mediumAvatarUrl}
            className="w-12 h-12 flex-shrink-0"
            alt=""
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <h2 className="font-title text-isaac-accent text-sm leading-relaxed truncate min-w-0">
          {playerLabel}
        </h2>
        {currentUser && !isSelf && (
          <div className="flex-shrink-0 flex items-center gap-1.5 border border-isaac-border px-2 py-1">
            <FollowButton
              steamId={steamId}
              isFollowing={isFollowing}
              onFollow={onFollow}
              onUnfollow={onUnfollow}
            />
            <span className="text-xs text-isaac-muted">
              {isFollowing ? "Following" : "Follow"}
            </span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Runs", value: entries.length },
          { label: "Avg Rank", value: avgRank.toFixed(1) },
          { label: "Best Rank", value: bestRank },
          { label: "1st Place Finishes", value: firstPlaces },
        ].map(({ label, value }) => (
          <div key={label} className="border border-isaac-border bg-isaac-surface px-4 py-3 text-center">
            <div className="text-isaac-muted text-xs uppercase tracking-widest mb-1">{label}</div>
            <div className="font-mono text-isaac-text text-lg tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {/* Streaks row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="border border-isaac-border bg-isaac-surface px-4 py-3 text-center">
          <div className="text-isaac-muted text-xs uppercase tracking-widest mb-1">Record</div>
          <div className="font-mono text-isaac-text text-lg tabular-nums">
            {wins}–{entries.length - wins}
          </div>
        </div>
        <div className="border border-isaac-border bg-isaac-surface px-4 py-3 text-center">
          <div className="text-isaac-muted text-xs uppercase tracking-widest mb-1">Current Streak</div>
          {streaks.current === 0 ? (
            <div className="font-mono text-isaac-muted text-lg">—</div>
          ) : (
            <>
              <div className={`font-mono text-lg tabular-nums ${streaks.currentType === "win" ? "text-green-400" : "text-red-400"}`}>
                {streaks.current}{streaks.currentType === "win" ? "W" : "L"}
              </div>
              {streaks.currentStreakStart && (
                <div className="text-isaac-muted text-[10px] font-mono mt-0.5">
                  since {format(parseISO(streaks.currentStreakStart), "MMM d, yyyy")}
                </div>
              )}
            </>
          )}
        </div>
        <div className="border border-isaac-border bg-isaac-surface px-4 py-3 text-center">
          <div className="text-isaac-muted text-xs uppercase tracking-widest mb-1">Longest Win Streak</div>
          {streaks.longestWin ? (
            <>
              <div className="font-mono text-green-400 text-lg tabular-nums">{streaks.longestWin.count}</div>
              <div className="text-isaac-muted text-[10px] font-mono mt-0.5">
                {format(parseISO(streaks.longestWin.start), "MMM d, yyyy")}
                {streaks.longestWin.start !== streaks.longestWin.end && (
                  <> – {format(parseISO(streaks.longestWin.end), "MMM d, yyyy")}</>
                )}
              </div>
            </>
          ) : (
            <div className="font-mono text-isaac-muted text-lg">—</div>
          )}
        </div>
        <div className="border border-isaac-border bg-isaac-surface px-4 py-3 text-center">
          <div className="text-isaac-muted text-xs uppercase tracking-widest mb-1">Longest Loss Streak</div>
          {streaks.longestLoss ? (
            <>
              <div className="font-mono text-red-400 text-lg tabular-nums">{streaks.longestLoss.count}</div>
              <div className="text-isaac-muted text-[10px] font-mono mt-0.5">
                {format(parseISO(streaks.longestLoss.start), "MMM d, yyyy")}
                {streaks.longestLoss.start !== streaks.longestLoss.end && (
                  <> – {format(parseISO(streaks.longestLoss.end), "MMM d, yyyy")}</>
                )}
              </div>
            </>
          ) : (
            <div className="font-mono text-isaac-muted text-lg">—</div>
          )}
        </div>
      </div>

      {/* Run history table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
              <th className="text-left py-3 w-36">Date</th>
              <th className="text-right pr-4 py-3 w-20">Rank</th>
              <th className="text-right pr-6 py-3 w-40">
                {sortType === "score" ? "Score" : "Time"}
              </th>
              {currentUser?.role && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <RunRow key={entry.date} entry={entry} idx={idx} sortType={sortType} canHide={!!currentUser?.role} onHide={onHide} onScoreClick={onScoreClick} onDateClick={onDateClick} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Hidden scores — mod/admin only */}
      {hiddenEntries && hiddenEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-isaac-muted border-b border-isaac-border pb-2">
            Hidden Scores ({hiddenEntries.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
                  <th className="text-left py-3 w-36">Date</th>
                  <th className="text-right pr-4 py-3 w-20">Rank</th>
                  <th className="text-right pr-6 py-3 w-40">
                    {sortType === "score" ? "Score" : "Time"}
                  </th>
                  <th className="text-left py-3 w-24">Source</th>
                </tr>
              </thead>
              <tbody>
                {hiddenEntries.map((entry, idx) => (
                  <HiddenRunRow key={entry.id} entry={entry} idx={idx} sortType={sortType} onScoreClick={onScoreClick} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ entry, idx, sortType, canHide, onHide, onScoreClick, onDateClick }: { entry: PlayerRun; idx: number; sortType: SortType; canHide: boolean; onHide: (id: number) => void; onScoreClick: (id: number) => void; onDateClick: (date: string, rank: number) => void }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const rowClass = idx % 2 === 0 ? "bg-isaac-surface" : "bg-transparent";

  const rankClass =
    entry.rank === 1
      ? "text-isaac-gold font-bold"
      : entry.rank === 2
      ? "text-gray-300 font-bold"
      : entry.rank === 3
      ? "text-amber-600 font-bold"
      : "text-isaac-muted";

  const valueLabel =
    sortType === "time"
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

  const hasDetails = (entry.level != null && entry.level !== 0) || bonuses.length > 0 || penalties.length > 0;

  return (
    <>
      <tr
        className={`${rowClass} border-b border-isaac-border hover:bg-isaac-border transition-colors`}
        onMouseEnter={(e) => { setHovered(true); setPos({ x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHovered(false)}
      >
        <td className="py-2.5 pl-2 font-mono">
          <button
            onClick={() => onDateClick(entry.date, entry.rank)}
            className="text-isaac-text hover:text-isaac-accent transition-colors"
          >
            {format(parseISO(entry.date), "MMM d, yyyy")}
          </button>
        </td>
        <td className={`text-right pr-4 py-2.5 tabular-nums ${rankClass}`}>
          {entry.rank}
        </td>
        <td className="text-right pr-6 py-2.5 tabular-nums font-mono">
          <button
            onClick={(e) => { e.stopPropagation(); onScoreClick(entry.id); }}
            className="text-isaac-text hover:text-isaac-accent transition-colors"
          >
            {valueLabel}
          </button>
        </td>
        {canHide && (
          <td className="py-2.5 pl-1 w-8">
            <button
              onClick={(e) => { e.stopPropagation(); onHide(entry.id); }}
              title="Hide this score"
              className="text-xs w-5 h-5 flex items-center justify-center text-isaac-muted hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          </td>
        )}
      </tr>
      {hovered && hasDetails && createPortal(
        <div
          className="fixed z-50 pointer-events-none bg-isaac-surface border border-isaac-border rounded p-3 text-xs shadow-lg min-w-40"
          style={{ left: pos.x + 16, top: pos.y - 8 }}
        >
          {entry.level != null && (
            <div className="mb-2 text-isaac-muted">
              Floor <span className="text-isaac-text font-mono">{entry.level}</span>
              {entry.time_taken != null && (
                <> · <span className="text-isaac-text font-mono">{formatFrames(entry.time_taken)}</span></>
              )}
            </div>
          )}
          {bonuses.length > 0 && (
            <div className={penalties.length > 0 ? "mb-2" : ""}>
              <div className="text-isaac-muted uppercase tracking-wider text-[10px] mb-1">Bonuses</div>
              {bonuses.map((b) => (
                <div key={b.label} className="flex justify-between gap-6">
                  <span className="text-isaac-muted">{b.label}</span>
                  <span className="text-green-400 font-mono tabular-nums">+{b.value!.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          {penalties.length > 0 && (
            <div>
              <div className="text-isaac-muted uppercase tracking-wider text-[10px] mb-1">Penalties</div>
              {penalties.map((p) => (
                <div key={p.label} className="flex justify-between gap-6">
                  <span className="text-isaac-muted">{p.label}</span>
                  <span className="text-red-400 font-mono tabular-nums">−{p.value!.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function HiddenRunRow({ entry, idx, sortType, onScoreClick }: { entry: PlayerHiddenRun; idx: number; sortType: SortType; onScoreClick: (id: number) => void }) {
  const rowClass = idx % 2 === 0 ? "bg-isaac-surface" : "bg-transparent";
  const valueLabel =
    sortType === "time"
      ? (entry.time_taken != null ? formatFrames(entry.time_taken) : "—")
      : (entry.value != null ? entry.value.toLocaleString() : "—");
  const sourceColor =
    entry.hidden_source === "automod" ? "text-orange-400 border-orange-400/50" :
    entry.hidden_source === "report"  ? "text-yellow-400 border-yellow-400/50" :
                                        "text-isaac-muted border-isaac-border";
  return (
    <tr className={`${rowClass} border-b border-isaac-border`}>
      <td className="py-2.5 pl-2 text-isaac-muted font-mono">
        {format(parseISO(entry.date), "MMM d, yyyy")}
      </td>
      <td className="text-right pr-4 py-2.5 tabular-nums text-isaac-muted font-mono">
        {entry.rank}
      </td>
      <td className="text-right pr-6 py-2.5 tabular-nums font-mono">
        <button
          onClick={() => onScoreClick(entry.id)}
          className="text-isaac-muted hover:text-isaac-accent transition-colors"
        >
          {valueLabel}
        </button>
      </td>
      <td className="py-2.5">
        {entry.hidden_source && (
          <span className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${sourceColor}`}>
            {entry.hidden_source}
          </span>
        )}
      </td>
    </tr>
  );
}

interface StreakSpan { count: number; start: string; end: string; }

function computeStreaks(entries: PlayerRun[]) {
  if (entries.length === 0) {
    return {
      current: 0, currentType: null as "win" | "loss" | null,
      longestWin: null as StreakSpan | null,
      longestLoss: null as StreakSpan | null,
    };
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let longestWin: StreakSpan | null = null;
  let longestLoss: StreakSpan | null = null;
  let runStart = 0, runLen = 0, runType: "win" | "loss" | null = null;

  const commit = (type: "win" | "loss", start: number, end: number, len: number) => {
    const span: StreakSpan = { count: len, start: sorted[start].date, end: sorted[end].date };
    if (type === "win" && (!longestWin || len > longestWin.count)) longestWin = span;
    if (type === "loss" && (!longestLoss || len > longestLoss.count)) longestLoss = span;
  };

  for (let i = 0; i < sorted.length; i++) {
    const r: "win" | "loss" = sorted[i].goal != null && sorted[i].goal! > 1 ? "win" : "loss";
    if (r === runType) {
      runLen++;
    } else {
      if (runType !== null) commit(runType, runStart, i - 1, runLen);
      runType = r;
      runStart = i;
      runLen = 1;
    }
  }
  if (runType !== null) commit(runType, runStart, sorted.length - 1, runLen);

  const currentType = (sorted[sorted.length - 1].goal != null && sorted[sorted.length - 1].goal! > 1) ? "win" : "loss";
  let current = 0;
  let currentStreakStartIdx = sorted.length - 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].goal != null && sorted[i].goal! > 1 ? "win" : "loss";
    if (r === currentType) { current++; currentStreakStartIdx = i; }
    else break;
  }
  const currentStreakStart = current > 0 ? sorted[currentStreakStartIdx].date : null;

  return { current, currentType, currentStreakStart, longestWin, longestLoss };
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

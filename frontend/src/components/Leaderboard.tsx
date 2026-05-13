import { useState } from "react";
import { createPortal } from "react-dom";
import type { LeaderboardEntry, SortType, User } from "../types";
import { FollowButton } from "./FollowButton";

interface Props {
  entries: LeaderboardEntry[];
  sortType: SortType;
  pageOffset: number;
  avatars: Record<string, string>;
  friendsEntries: LeaderboardEntry[];
  currentUser: User | null;
  follows: Set<string>;
  onPlayerClick: (steamId: string) => void;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
  onHide: (entryId: number) => void;
  onReport: (entryId: number, playerName: string | null) => void;
}

export function Leaderboard({
  entries,
  sortType,
  pageOffset,
  avatars,
  friendsEntries,
  currentUser,
  follows,
  onPlayerClick,
  onFollow,
  onUnfollow,
  onHide,
  onReport,
}: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-isaac-muted py-12 text-sm">
        No entries found.
      </div>
    );
  }

  const showFriends = friendsEntries.length > 0;
  const hasOwnEntry = currentUser != null && friendsEntries.some(e => e.steam_id === currentUser.steam_id);
  const hasFriendEntries = friendsEntries.some(e => e.steam_id !== currentUser?.steam_id);
  const sectionLabel = hasOwnEntry && hasFriendEntries ? "You & Following" : hasOwnEntry ? "Your Score" : "Following";

  return (
    <div className="space-y-4">
      {showFriends && (
        <div className="border border-isaac-accent/40 overflow-hidden">
          <div className="bg-isaac-accent/10 px-4 py-2 text-xs text-isaac-accent uppercase tracking-widest border-b border-isaac-accent/40">
            {sectionLabel}
          </div>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {friendsEntries.map((entry, idx) => (
                <Row
                  key={entry.steam_id}
                  entry={entry}
                  idx={idx}
                  sortType={sortType}
                  avatarUrl={avatars[entry.steam_id]}
                  currentUser={currentUser}
                  isFollowing={follows.has(entry.steam_id)}
                  onPlayerClick={onPlayerClick}
                  onFollow={onFollow}
                  onUnfollow={onUnfollow}
                  onHide={onHide}
                  onReport={onReport}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-isaac-bg">
            <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
              <th className="text-right pr-4 py-3 w-16">#</th>
              <th className="text-left py-3">Player</th>
              <th className="text-right pr-6 py-3 w-40">
                {sortType === "score" ? "Score" : "Time"}
              </th>
              {currentUser && <th className="w-16" />}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <Row
                key={entry.steam_id}
                entry={entry}
                idx={pageOffset + idx}
                sortType={sortType}
                avatarUrl={avatars[entry.steam_id]}
                currentUser={currentUser}
                isFollowing={follows.has(entry.steam_id)}
                onPlayerClick={onPlayerClick}
                onFollow={onFollow}
                onUnfollow={onUnfollow}
                onHide={onHide}
                onReport={onReport}
              />
            ))}
          </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  entry: LeaderboardEntry;
  idx: number;
  sortType: SortType;
  avatarUrl?: string;
  currentUser: User | null;
  isFollowing: boolean;
  onPlayerClick: (steamId: string) => void;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
  onHide: (entryId: number) => void;
  onReport: (entryId: number, playerName: string | null) => void;
}

function Row({ entry, idx, sortType, avatarUrl, currentUser, isFollowing, onPlayerClick, onFollow, onUnfollow, onHide, onReport }: RowProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const rankClass =
    entry.rank === 1
      ? "text-isaac-gold font-bold"
      : entry.rank === 2
      ? "text-gray-300 font-bold"
      : entry.rank === 3
      ? "text-amber-600 font-bold"
      : "text-isaac-muted";

  const rowClass =
    idx % 2 === 0 ? "bg-isaac-surface" : "bg-transparent";

  const playerLabel =
    entry.player_name ?? `[${entry.steam_id}]`;

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
  const isSelf = currentUser?.steam_id === entry.steam_id;
  const canReport = !!currentUser && !currentUser.role && !isSelf;

  return (
    <>
      <tr
        className={`${rowClass} border-b border-isaac-border hover:bg-isaac-border transition-colors`}
        onMouseEnter={(e) => { setHovered(true); setPos({ x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHovered(false)}
      >
        <td className={`text-right pr-4 py-2.5 tabular-nums ${rankClass}`}>
          {entry.rank}
        </td>
        <td className="py-2.5 text-isaac-text max-w-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPlayerClick(entry.steam_id)}
              className="flex items-center gap-2 hover:text-isaac-accent transition-colors text-left min-w-0"
            >
              {avatarUrl?.startsWith("https://") && <img src={avatarUrl} className="w-6 h-6 flex-shrink-0" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              <span className="truncate">{playerLabel}</span>
              {entry.goal != null && entry.goal < 2 && (
                <span title="Died during run" className="text-red-500 flex-shrink-0">💀</span>
              )}
            </button>
            {currentUser && !isSelf && (
              <FollowButton
                steamId={entry.steam_id}
                isFollowing={isFollowing}
                onFollow={onFollow}
                onUnfollow={onUnfollow}
              />
            )}
          </div>
        </td>
        <td className="text-right pr-6 py-2.5 tabular-nums text-isaac-text font-mono">
          {valueLabel}
        </td>
        {currentUser && (
          <td className="py-2.5 pr-2 w-16">
            <div className="flex items-center justify-end gap-1">
              {currentUser.role && (
                <button
                  onClick={(e) => { e.stopPropagation(); onHide(entry.id); }}
                  title="Hide this score"
                  className="text-base w-10 h-10 flex items-center justify-center text-isaac-muted hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              )}
              {canReport && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReport(entry.id, entry.player_name); }}
                  title="Report this score"
                  className="text-base w-10 h-10 flex items-center justify-center text-isaac-muted hover:text-yellow-400 transition-colors"
                >
                  ⚑
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {hovered && hasDetails && createPortal(
        <div
          className="fixed z-50 pointer-events-none bg-isaac-surface border border-isaac-border rounded p-3 text-xs shadow-lg min-w-40"
          style={{ left: pos.x + 16, top: pos.y - 8 }}
        >
          {entry.level != null && entry.level !== 0 && (
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

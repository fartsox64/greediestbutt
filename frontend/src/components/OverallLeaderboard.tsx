import type { OverallEntry, User } from "../types";
import { FollowButton } from "./FollowButton";
import { safeHttpsUrl } from "../utils";

interface Props {
  entries: OverallEntry[];
  onPlayerClick: (steamId: string, playerName: string | null) => void;
  avatars: Record<string, string>;
  currentUser: User | null;
  follows: Set<string>;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
}

export function OverallLeaderboard({
  entries,
  onPlayerClick,
  avatars,
  currentUser,
  follows,
  onFollow,
  onUnfollow,
}: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center text-isaac-muted py-12 text-sm">
        No entries found.
      </div>
    );
  }

  return (
    <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-isaac-bg">
          <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
            <th className="text-right pr-4 py-3 w-16">#</th>
            <th className="text-left py-3">Player</th>
            <th className="text-right py-3 w-24 hidden sm:table-cell">Runs</th>
            <th className="text-right py-3 w-28">Avg Rank</th>
            <th className="text-right py-3 w-24 hidden sm:table-cell">Best</th>
            <th className="text-right pr-6 py-3 w-20">Wins</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => (
            <OverallRow
              key={entry.steam_id}
              entry={entry}
              idx={idx}
              onPlayerClick={onPlayerClick}
              avatarUrl={avatars[entry.steam_id]}
              currentUser={currentUser}
              isFollowing={follows.has(entry.steam_id)}
              onFollow={onFollow}
              onUnfollow={onUnfollow}
            />
          ))}
        </tbody>
      </table>
  );
}

function OverallRow({
  entry,
  idx,
  onPlayerClick,
  avatarUrl,
  currentUser,
  isFollowing,
  onFollow,
  onUnfollow,
}: {
  entry: OverallEntry;
  idx: number;
  onPlayerClick: (steamId: string, playerName: string | null) => void;
  avatarUrl?: string;
  currentUser: User | null;
  isFollowing: boolean;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
}) {
  const rankClass =
    entry.rank === 1
      ? "text-isaac-gold font-bold"
      : entry.rank === 2
      ? "text-gray-300 font-bold"
      : entry.rank === 3
      ? "text-amber-600 font-bold"
      : "text-isaac-muted";

  const rowClass = idx % 2 === 0 ? "bg-isaac-surface" : "bg-transparent";
  const playerLabel = entry.player_name ?? `[${entry.steam_id}]`;
  const isSelf = currentUser?.steam_id === entry.steam_id;
  const avatarSrc = safeHttpsUrl(avatarUrl);

  return (
    <tr className={`${rowClass} border-b border-isaac-border hover:bg-isaac-border transition-colors`}>
      <td className={`text-right pr-4 py-2.5 tabular-nums ${rankClass}`}>
        {entry.rank}
      </td>
      <td className="py-2.5 max-w-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPlayerClick(entry.steam_id, entry.player_name)}
            className="flex items-center gap-2 text-isaac-text hover:text-isaac-accent transition-colors text-left min-w-0"
          >
            {avatarSrc && <img src={avatarSrc} className="w-6 h-6 flex-shrink-0" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            <span className="truncate">{playerLabel}</span>
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
      <td className="text-right py-2.5 tabular-nums text-isaac-muted font-mono hidden sm:table-cell">
        {entry.runs_played}
      </td>
      <td className="text-right py-2.5 tabular-nums text-isaac-text font-mono">
        {entry.avg_rank.toFixed(1)}
      </td>
      <td className="text-right py-2.5 tabular-nums text-isaac-muted font-mono hidden sm:table-cell">
        {entry.best_rank}
      </td>
      <td className="text-right pr-6 py-2.5 tabular-nums text-isaac-text font-mono">
        {entry.wins > 0 ? entry.wins : <span className="text-isaac-muted">—</span>}
      </td>
    </tr>
  );
}

import type { GameVersion, ProfileResponse, ProfileRunTypeStats, SortType, User } from "../types";
import { VERSION_LABELS } from "../types";
import { FollowButton } from "./FollowButton";

interface Props {
  profile: ProfileResponse;
  currentUser: User | null;
  isFollowing: boolean;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
  onGrantModerator: (steamId: string) => void;
  onRevokeModerator: (steamId: string) => void;
  onBan: (steamId: string) => void;
  onUnban: (steamId: string) => void;
  onViewRunHistory: (steamId: string, version: GameVersion, sortType: SortType, playerName: string | null) => void;
  onBack: () => void;
}

export function UserProfile({
  profile,
  currentUser,
  isFollowing,
  onFollow,
  onUnfollow,
  onGrantModerator,
  onRevokeModerator,
  onBan,
  onUnban,
  onViewRunHistory,
  onBack,
}: Props) {
  const playerLabel = profile.player_name ?? `[${profile.steam_id}]`;
  const mediumAvatarUrl = profile.avatar_url
    ? profile.avatar_url.replace(".jpg", "_medium.jpg")
    : undefined;
  const isSelf = currentUser?.steam_id === profile.steam_id;
  const isMod = currentUser?.role === "admin" || currentUser?.role === "moderator";

  const totalRuns = profile.stats.reduce((s, r) => s + r.runs_played, 0);
  const totalWins = profile.stats.reduce((s, r) => s + r.wins, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-title text-isaac-accent text-sm leading-relaxed truncate min-w-0">
            {playerLabel}
          </h2>
          <a
            href={`https://steamcommunity.com/profiles/${profile.steam_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-isaac-muted hover:text-isaac-accent transition-colors"
            title="View Steam profile"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39l3.05-6.3a3.5 3.5 0 0 1-.76-.46 3.47 3.47 0 0 1-1.25-2.67 3.48 3.48 0 0 1 3.48-3.48c.95 0 1.81.38 2.44 1l5.95-2.43C20.3 5.9 16.46 3 12 3V0zm0 3c3.62 0 6.79 1.76 8.77 4.47l-5.95 2.43A3.48 3.48 0 0 0 12.73 9h-.01a3.48 3.48 0 0 0-3.25 2.24L5.5 9.67A9 9 0 0 1 12 3zm-6.5 6.67 3.97 1.56a3.48 3.48 0 0 0 2.3 4.6l-3.06 6.3A9 9 0 0 1 3 12c0-1.01.17-1.97.5-2.88v.55zm7.23 1.83a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/>
            </svg>
          </a>
        </div>
        {currentUser && !isSelf && (
          <div className="flex-shrink-0 flex items-center gap-1.5 border border-isaac-border px-2 py-1">
            <FollowButton
              steamId={profile.steam_id}
              isFollowing={isFollowing}
              onFollow={onFollow}
              onUnfollow={onUnfollow}
            />
            <span className="text-xs text-isaac-muted">
              {isFollowing ? "Following" : "Follow"}
            </span>
          </div>
        )}
        {currentUser?.role === "admin" && !isSelf && profile.role !== "admin" && (
          profile.role === "moderator" ? (
            <button
              onClick={() => onRevokeModerator(profile.steam_id)}
              className="flex-shrink-0 text-xs border border-isaac-border px-3 py-1.5 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
            >
              Remove Moderator
            </button>
          ) : (
            <button
              onClick={() => onGrantModerator(profile.steam_id)}
              className="flex-shrink-0 text-xs border border-isaac-border px-3 py-1.5 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
            >
              Make Moderator
            </button>
          )
        )}
        {isMod && !isSelf && profile.role !== "admin" && !profile.is_banned && (
          <button
            onClick={() => onBan(profile.steam_id)}
            className="flex-shrink-0 text-xs border border-red-400/50 px-3 py-1.5 text-red-400 hover:bg-red-400/10 transition-colors"
          >
            Ban User
          </button>
        )}
        {currentUser?.role === "admin" && !isSelf && profile.is_banned && (
          <button
            onClick={() => onUnban(profile.steam_id)}
            className="flex-shrink-0 text-xs border border-red-400/50 px-3 py-1.5 text-red-400 hover:bg-red-400/10 transition-colors"
          >
            Unban
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Runs", value: totalRuns },
          { label: "Total Wins", value: totalWins },
          { label: "Followers", value: profile.follower_count },
          { label: "Following", value: profile.following_count },
        ].map(({ label, value }) => (
          <div key={label} className="border border-isaac-border bg-isaac-surface px-4 py-3 text-center">
            <div className="text-isaac-muted text-xs uppercase tracking-widest mb-1">{label}</div>
            <div className="font-mono text-isaac-text text-lg tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {/* Per-run-type breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
              <th className="text-left py-3">Version</th>
              <th className="text-left py-3 w-20">Type</th>
              <th className="text-right py-3 w-20">Runs</th>
              <th className="text-right py-3 w-28">Avg Rank</th>
              <th className="text-right py-3 w-24">Best</th>
              <th className="text-right py-3 w-20">Wins</th>
              <th className="text-right py-3 w-24">Streak</th>
              <th className="text-right py-3 w-24">Best W</th>
              <th className="text-right pr-6 py-3 w-24">Best L</th>
            </tr>
          </thead>
          <tbody>
            {profile.stats.map((row, idx) => (
              <StatsRow
                key={`${row.version}-${row.sort_type}`}
                row={row}
                idx={idx}
                steamId={profile.steam_id}
                playerName={profile.player_name}
                onViewRunHistory={onViewRunHistory}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsRow({
  row,
  idx,
  steamId,
  playerName,
  onViewRunHistory,
}: {
  row: ProfileRunTypeStats;
  idx: number;
  steamId: string;
  playerName: string | null;
  onViewRunHistory: (steamId: string, version: GameVersion, sortType: SortType, playerName: string | null) => void;
}) {
  const rowClass = idx % 2 === 0 ? "bg-isaac-surface" : "bg-transparent";

  return (
    <tr
      className={`${rowClass} border-b border-isaac-border hover:bg-isaac-border transition-colors cursor-pointer`}
      onClick={() => onViewRunHistory(steamId, row.version, row.sort_type, playerName)}
      title="View run history"
    >
      <td className="py-2.5 text-isaac-text">
        {VERSION_LABELS[row.version]}
      </td>
      <td className="py-2.5 text-isaac-muted capitalize">
        {row.sort_type}
      </td>
      <td className="text-right py-2.5 tabular-nums text-isaac-muted font-mono">
        {row.runs_played}
      </td>
      <td className="text-right py-2.5 tabular-nums text-isaac-text font-mono">
        {row.avg_rank.toFixed(1)}
      </td>
      <td className="text-right py-2.5 tabular-nums text-isaac-muted font-mono">
        {row.best_rank}
      </td>
      <td className="text-right py-2.5 tabular-nums text-isaac-text font-mono">
        {row.wins > 0 ? row.wins : <span className="text-isaac-muted">—</span>}
      </td>
      <td className={`text-right py-2.5 tabular-nums font-mono ${row.current_streak_type === "win" ? "text-green-400" : row.current_streak_type === "loss" ? "text-red-400" : "text-isaac-muted"}`}>
        {row.current_streak > 0 ? `${row.current_streak}${row.current_streak_type === "win" ? "W" : "L"}` : "—"}
      </td>
      <td className="text-right py-2.5 tabular-nums font-mono text-green-400">
        {row.longest_win_streak > 0 ? row.longest_win_streak : <span className="text-isaac-muted">—</span>}
      </td>
      <td className="text-right pr-6 py-2.5 tabular-nums font-mono text-red-400">
        {row.longest_loss_streak > 0 ? row.longest_loss_streak : <span className="text-isaac-muted">—</span>}
      </td>
    </tr>
  );
}

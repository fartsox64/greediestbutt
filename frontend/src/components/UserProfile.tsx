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
              <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.455 1.012zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.662 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
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

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fetchHeadToHead } from "../api/client";
import { VERSION_LABELS } from "../types";
import { safeHttpsUrl } from "../utils";

interface Props {
  p1Id: string;
  p2Id: string;
  onPlayerClick: (steamId: string) => void;
  onBack: () => void;
}

export function HeadToHead({ p1Id, p2Id, onPlayerClick, onBack }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["h2h", p1Id, p2Id],
    queryFn: () => fetchHeadToHead(p1Id, p2Id),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-isaac-muted hover:text-isaac-text transition-colors border border-isaac-border px-3 py-1.5"
        >
          ← Back
        </button>
      </div>

      {isLoading && <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">Loading…</div>}
      {isError && <div className="text-center py-16 text-isaac-muted text-sm">Failed to load head-to-head data.</div>}

      {data && (
        <>
          {/* Header cards */}
          <div className="grid grid-cols-3 gap-3 items-center">
            <PlayerCard info={data.p1} wins={data.p1_wins} total={data.shared_days} onPlayerClick={onPlayerClick} side="left" />
            <div className="text-center space-y-1">
              <div className="text-xs text-isaac-muted uppercase tracking-widest">vs</div>
              <div className="text-2xl font-mono tabular-nums font-bold text-isaac-text">
                {data.p1_wins}–{data.p2_wins}
              </div>
              {data.ties > 0 && <div className="text-xs text-isaac-muted">{data.ties} tie{data.ties !== 1 ? "s" : ""}</div>}
              <div className="text-xs text-isaac-muted">{data.shared_days} shared {data.shared_days === 1 ? "day" : "days"}</div>
            </div>
            <PlayerCard info={data.p2} wins={data.p2_wins} total={data.shared_days} onPlayerClick={onPlayerClick} side="right" />
          </div>

          {/* Recent shared runs */}
          {data.recent.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-widest text-isaac-muted border-b border-isaac-border pb-2">Recent</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
                    <th className="text-left py-2 pl-2">Date</th>
                    <th className="text-left py-2">Mode</th>
                    <th className="text-right pr-4 py-2">{data.p1.player_name ?? `[${data.p1.steam_id}]`}</th>
                    <th className="text-right pr-2 py-2">{data.p2.player_name ?? `[${data.p2.steam_id}]`}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((run, i) => {
                    const p1Won = run.p1_rank < run.p2_rank;
                    const tie = run.p1_rank === run.p2_rank;
                    return (
                      <tr key={i} className={`border-b border-isaac-border ${i % 2 === 0 ? "bg-isaac-surface" : ""}`}>
                        <td className="py-2 pl-2 font-mono text-isaac-muted">
                          {format(parseISO(run.date), "MMM d, yyyy")}
                        </td>
                        <td className="py-2 text-xs text-isaac-muted">
                          {VERSION_LABELS[run.version]} · {run.sort_type}
                        </td>
                        <td className={`text-right pr-4 py-2 tabular-nums font-mono ${!tie && p1Won ? "text-green-400 font-bold" : "text-isaac-muted"}`}>
                          #{run.p1_rank}
                        </td>
                        <td className={`text-right pr-2 py-2 tabular-nums font-mono ${!tie && !p1Won ? "text-green-400 font-bold" : "text-isaac-muted"}`}>
                          #{run.p2_rank}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.shared_days === 0 && (
            <div className="text-center py-8 text-isaac-muted text-sm">These players have never played on the same day.</div>
          )}
        </>
      )}
    </div>
  );
}

function PlayerCard({ info, wins, total, onPlayerClick, side }: {
  info: { steam_id: string; player_name: string | null; avatar_url: string | null };
  wins: number;
  total: number;
  onPlayerClick: (steamId: string) => void;
  side: "left" | "right";
}) {
  const label = info.player_name ?? `[${info.steam_id}]`;
  const avatarSrc = safeHttpsUrl(info.avatar_url);
  const pct = total > 0 ? Math.round(wins / total * 100) : 0;
  return (
    <div className={`border border-isaac-border bg-isaac-surface p-4 space-y-2 text-${side === "left" ? "left" : "right"}`}>
      <button onClick={() => onPlayerClick(info.steam_id)} className="hover:text-isaac-accent transition-colors flex items-center gap-2 w-full">
        {side === "left" && avatarSrc && <img src={avatarSrc} className="w-8 h-8 flex-shrink-0" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
        <span className={`text-sm font-semibold truncate ${side === "right" ? "ml-auto" : ""}`}>{label}</span>
        {side === "right" && avatarSrc && <img src={avatarSrc} className="w-8 h-8 flex-shrink-0" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </button>
      <div className={`text-2xl font-mono tabular-nums font-bold ${pct >= 50 ? "text-green-400" : "text-red-400"}`}>
        {pct}%
      </div>
      <div className="text-xs text-isaac-muted">{wins} win{wins !== 1 ? "s" : ""}</div>
    </div>
  );
}

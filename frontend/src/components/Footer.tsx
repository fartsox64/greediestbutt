import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fetchStats } from "../api/client";

interface Props {
  onAbout: () => void;
  onStats: () => void;
}

const LS_KEY = "gbstats";

function readCached() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? ""); } catch { return undefined; }
}

export function Footer({ onAbout, onStats }: Props) {
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const result = await fetchStats();
      try { localStorage.setItem(LS_KEY, JSON.stringify(result)); } catch { /* quota */ }
      return result;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    initialData: readCached,
  });

  return (
    <footer className="border-t border-isaac-border mt-12">
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-isaac-muted">
        {data ? (
          <>
            <span>{data.total_entries.toLocaleString()} scores</span>
            <span className="text-isaac-border">·</span>
            <span>{data.total_players.toLocaleString()} players</span>
            <span className="text-isaac-border">·</span>
            <span>
              {data.last_scraped_at
                ? `updated ${formatDistanceToNow(parseISO(data.last_scraped_at), { addSuffix: true })}`
                : "not yet scraped"}
            </span>
          </>
        ) : (
          <span className="opacity-0">—</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <button
            onClick={onStats}
            className="hover:text-isaac-text transition-colors"
          >
            Stats
          </button>
          <span className="text-isaac-border">·</span>
          <button
            onClick={onAbout}
            className="hover:text-isaac-text transition-colors"
          >
            About
          </button>
        </span>
      </div>
    </footer>
  );
}

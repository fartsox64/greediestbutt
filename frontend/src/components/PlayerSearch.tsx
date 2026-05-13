import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchPlayers } from "../api/client";
import type { GameVersion, SortType } from "../types";

interface Props {
  version: GameVersion;
  sortType: SortType;
  onSelect: (steamId: string) => void;
}

export function PlayerSearch({ version, sortType, onSelect }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce input → query
  useEffect(() => {
    if (!input.trim()) {
      setQuery("");
      return;
    }
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data } = useQuery({
    queryKey: ["search", version, sortType, query],
    queryFn: () => searchPlayers({ q: query, version, sort_type: sortType }),
    enabled: query.length > 0,
    staleTime: 30_000,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const results = data?.results ?? [];
  const showDropdown = open && query.length > 0 && results.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search player…"
        className="bg-transparent border border-isaac-border text-isaac-text text-xs px-3 py-1.5 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent w-44"
      />
      {showDropdown && (
        <div className="absolute top-full left-0 z-50 mt-0.5 w-72 border border-isaac-border bg-isaac-bg shadow-lg">
          {results.map((r) => {
            const label = r.player_name ?? `[${r.steam_id}]`;
            return (
              <button
                key={r.steam_id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInput("");
                  setQuery("");
                  setOpen(false);
                  onSelect(r.steam_id);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-isaac-surface text-left"
              >
                <span className="text-isaac-text truncate">{label}</span>
                <span className="text-isaac-muted font-mono ml-3 flex-shrink-0">
                  #{r.best_rank} · {r.runs_played}d
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

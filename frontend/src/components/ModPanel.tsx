import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  dismissReport,
  fetchHiddenEntries,
  fetchPendingReports,
  hideEntry,
  unhideEntry,
} from "../api/client";
import { Pagination } from "./Pagination";
import type { HiddenEntry, ReportOut, ReportSummary } from "../types";
import { VERSION_LABELS } from "../types";

const PAGE_SIZE = 50;

type Tab = "hidden" | "reports";

export function ModPanel() {
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <div className="space-y-4">
      <div className="flex gap-0 border-b border-isaac-border">
        {(["reports", "hidden"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-isaac-accent text-isaac-accent"
                : "border-transparent text-isaac-muted hover:text-isaac-text"
            }`}
          >
            {t === "reports" ? "Pending Reports" : "Hidden Scores"}
          </button>
        ))}
      </div>

      {tab === "reports" ? <ReportsTab /> : <HiddenTab />}
    </div>
  );
}

function ReportsTab() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["mod-reports", page],
    queryFn: () => fetchPendingReports(page, PAGE_SIZE),
  });

  const handleDismiss = async (reportId: number) => {
    await dismissReport(reportId);
    queryClient.invalidateQueries({ queryKey: ["mod-reports"] });
    queryClient.invalidateQueries({ queryKey: ["pending-reports-count"] });
  };

  const handleHideScore = async (entryId: number) => {
    await hideEntry(entryId, "report");
    queryClient.invalidateQueries({ queryKey: ["mod-reports"] });
    queryClient.invalidateQueries({ queryKey: ["pending-reports-count"] });
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["overall-leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["friends-leaderboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">
          Pending Reports
        </h2>
        {data && (
          <span className="text-xs text-isaac-muted">
            {data.total} {data.total === 1 ? "report" : "reports"} pending
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">Loading…</div>
      ) : isError ? (
        <div className="border border-isaac-accent bg-red-950/30 text-isaac-accent px-4 py-3 text-sm">
          {(error as Error).message}
        </div>
      ) : data?.reports.length === 0 ? (
        <div className="text-center py-16 text-isaac-muted text-sm">No pending reports.</div>
      ) : (
        <>
          <div className="space-y-3">
            {data?.reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onDismiss={handleDismiss}
                onHideScore={handleHideScore}
              />
            ))}
          </div>
          {data && data.total_pages > 1 && (
            <Pagination page={data.page} totalPages={data.total_pages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function ReportCard({
  report,
  onDismiss,
  onHideScore,
}: {
  report: ReportOut;
  onDismiss: (reportId: number) => void;
  onHideScore: (entryId: number) => void;
}) {
  const playerLabel = report.entry_player_name ?? `[${report.entry_steam_id}]`;
  const reporterLabel = report.reporter_name ?? `[${report.reporter_steam_id}]`;

  return (
    <div className="border border-isaac-border bg-isaac-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="text-xs text-isaac-muted">
            <span className="text-isaac-text font-medium">{reporterLabel}</span>
            {" reported "}
            <span className="text-isaac-accent">{playerLabel}</span>
            {" · "}
            <span className="font-mono">{VERSION_LABELS[report.entry_version]}</span>
            {" · "}
            <span className="font-mono">{report.entry_sort_type}</span>
            {" · Rank "}
            <span className="font-mono">{report.entry_rank}</span>
          </div>
          <div className="text-xs text-isaac-muted font-mono">
            {format(parseISO(report.created_at), "MMM d, yyyy HH:mm")}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onDismiss(report.id)}
            className="text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => onHideScore(report.entry_id)}
            className="text-xs border border-red-400/50 px-2 py-1 text-red-400 hover:bg-red-400/10 transition-colors"
          >
            Hide Score
          </button>
        </div>
      </div>
      <p className="text-sm text-isaac-text border-l-2 border-isaac-border pl-3 whitespace-pre-wrap break-words">
        {report.reason}
      </p>
    </div>
  );
}

function HiddenTab() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["mod-hidden", page],
    queryFn: () => fetchHiddenEntries(page, PAGE_SIZE),
  });

  const handleUnhide = async (entryId: number) => {
    await unhideEntry(entryId);
    queryClient.invalidateQueries({ queryKey: ["mod-hidden"] });
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["overall-leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["player"] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    queryClient.invalidateQueries({ queryKey: ["friends-leaderboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">
          Hidden Scores
        </h2>
        {data && (
          <span className="text-xs text-isaac-muted">
            {data.total} {data.total === 1 ? "entry" : "entries"} hidden
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">Loading…</div>
      ) : isError ? (
        <div className="border border-isaac-accent bg-red-950/30 text-isaac-accent px-4 py-3 text-sm">
          {(error as Error).message}
        </div>
      ) : data?.entries.length === 0 ? (
        <div className="text-center py-16 text-isaac-muted text-sm">No hidden scores.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-isaac-border text-isaac-muted text-xs uppercase tracking-widest">
                  <th className="text-left py-3">Player</th>
                  <th className="text-left py-3 w-28">Date</th>
                  <th className="text-left py-3 w-36">Version</th>
                  <th className="text-left py-3 w-16">Type</th>
                  <th className="text-right pr-4 py-3 w-16">Rank</th>
                  <th className="text-right pr-6 py-3 w-32">Score / Time</th>
                  <th className="text-left py-3 w-24">Source</th>
                  <th className="text-left py-3 w-36">Hidden at</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((entry, idx) => (
                  <HiddenRow key={entry.id} entry={entry} idx={idx} onUnhide={handleUnhide} />
                ))}
              </tbody>
            </table>
          </div>
          {data && data.total_pages > 1 && (
            <Pagination page={data.page} totalPages={data.total_pages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function HiddenRow({
  entry,
  idx,
  onUnhide,
}: {
  entry: HiddenEntry;
  idx: number;
  onUnhide: (id: number) => void;
}) {
  const rowClass = idx % 2 === 0 ? "bg-isaac-surface" : "bg-transparent";
  const playerLabel = entry.player_name ?? `[${entry.steam_id}]`;

  const valueLabel =
    entry.sort_type === "time"
      ? (entry.time_taken != null ? formatFrames(entry.time_taken) : "—")
      : (entry.value != null ? entry.value.toLocaleString() : "—");

  return (
    <tr className={`${rowClass} border-b border-isaac-border`}>
      <td className="py-2.5 max-w-xs">
        <div className="flex items-center gap-2">
          <span className="truncate text-isaac-text">{playerLabel}</span>
          {entry.auto_banned && (
            <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-red-400 border border-red-400/50 px-1 py-0.5">
              banned
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 text-isaac-muted font-mono text-xs">
        {format(parseISO(entry.date), "MMM d, yyyy")}
      </td>
      <td className="py-2.5 text-isaac-muted text-xs">
        {VERSION_LABELS[entry.version]}
      </td>
      <td className="py-2.5 text-isaac-muted capitalize text-xs">
        {entry.sort_type}
      </td>
      <td className="text-right pr-4 py-2.5 tabular-nums text-isaac-muted font-mono">
        {entry.rank}
      </td>
      <td className="text-right pr-6 py-2.5 tabular-nums text-isaac-text font-mono">
        {valueLabel}
      </td>
      <td className="py-2.5">
        {entry.hidden_source === "report" ? (
          <ReportSourceBadge reports={entry.reports} />
        ) : entry.hidden_source === "direct" ? (
          <DirectSourceBadge hiddenByName={entry.hidden_by_name} hiddenAt={entry.hidden_at} />
        ) : (
          <span className="text-xs text-isaac-muted">—</span>
        )}
      </td>
      <td className="py-2.5 text-isaac-muted text-xs font-mono">
        {entry.hidden_at ? format(parseISO(entry.hidden_at), "MMM d, yyyy HH:mm") : "—"}
      </td>
      <td className="py-2.5 text-right pr-2">
        <button
          onClick={() => onUnhide(entry.id)}
          className="text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
        >
          Unhide
        </button>
      </td>
    </tr>
  );
}

function DirectSourceBadge({ hiddenByName, hiddenAt }: { hiddenByName: string | null; hiddenAt: string | null }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
  };

  return (
    <div className="inline-block">
      <span
        ref={badgeRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
        className="text-[10px] uppercase tracking-wider text-isaac-muted border border-isaac-border px-1.5 py-0.5 cursor-default"
      >
        direct
      </span>
      {pos && createPortal(
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 bg-isaac-surface border border-isaac-border shadow-xl px-3 py-2 pointer-events-none"
        >
          <div className="text-xs text-isaac-text">
            <span className="text-isaac-muted">Hidden by </span>
            <span className="font-medium">{hiddenByName ?? "Unknown"}</span>
            {hiddenAt && (
              <>
                <span className="text-isaac-muted"> on </span>
                <span className="font-mono">{format(parseISO(hiddenAt), "MMM d, yyyy HH:mm")}</span>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ReportSourceBadge({ reports }: { reports: ReportSummary[] }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (!badgeRef.current || reports.length === 0) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
  };

  return (
    <div className="inline-block">
      <span
        ref={badgeRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
        className="text-[10px] uppercase tracking-wider text-yellow-400 border border-yellow-400/50 px-1.5 py-0.5 cursor-default"
      >
        report
      </span>
      {pos && createPortal(
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-72 bg-isaac-surface border border-isaac-border shadow-xl p-3 space-y-2 pointer-events-none"
        >
          {reports.map((r, i) => (
            <div key={i} className={i > 0 ? "pt-2 border-t border-isaac-border" : ""}>
              <div className="text-[10px] text-isaac-muted mb-1">
                <span className="text-isaac-text font-medium">{r.reporter_name ?? "Unknown"}</span>
                {" · "}
                <span className="font-mono">{format(parseISO(r.created_at), "MMM d, yyyy")}</span>
              </div>
              <p className="text-xs text-isaac-text whitespace-pre-wrap break-words">{r.reason}</p>
            </div>
          ))}
        </div>,
        document.body,
      )}
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

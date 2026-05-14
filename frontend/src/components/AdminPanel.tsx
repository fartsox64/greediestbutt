import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  addFeedbackMessage,
  adminSearchPlayers,
  closeFeedback,
  fetchAllFeedback,
  fetchAllReports,
  fetchApiKey,
  fetchFeedbackThread,
  fetchModerators,
  fetchSchedulerStatus,
  grantModerator,
  regenerateApiKey,
  reopenFeedback,
  revokeModerator,
} from "../api/client";
import type { AdminPlayerResult, FeedbackItem, FeedbackThread, ReportOut, SchedulerJob } from "../types";
import { VERSION_LABELS } from "../types";
import { Pagination } from "./Pagination";

const JOB_LABELS: Record<string, string> = {
  scrape_recent:     "Scrape Recent",
  backfill_names:    "Name Backfill",
  full_stats_refresh: "Stats Refresh",
};

function ScheduledJobsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-scheduler"],
    queryFn: fetchSchedulerStatus,
    refetchInterval: 15_000,
  });

  const jobs: SchedulerJob[] = data?.jobs ?? [];

  function fmtAgo(iso: string | null): string {
    if (!iso) return "—";
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  function fmtIn(iso: string | null): string {
    if (!iso) return "—";
    const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    if (diff <= 0) return "now";
    if (diff < 60) return `in ${diff}s`;
    if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
    return `in ${Math.floor(diff / 3600)}h`;
  }

  return (
    <div className="space-y-3">
      <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">Scheduled Jobs</h2>
      {isLoading ? (
        <div className="text-isaac-muted text-sm animate-pulse">Loading…</div>
      ) : (
        <div className="border border-isaac-border divide-y divide-isaac-border">
          {jobs.map((job) => {
            const label = JOB_LABELS[job.id] ?? job.id;
            const statusColor =
              job.running          ? "text-blue-400 border-blue-400/50" :
              job.last_status === "ok"    ? "text-green-400 border-green-400/50" :
              job.last_status === "error" ? "text-red-400 border-red-400/50" :
                                           "text-isaac-muted border-isaac-border";
            const statusLabel =
              job.running          ? "running" :
              job.last_status ?? "never run";

            return (
              <div key={job.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {job.running && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  )}
                  <span className="text-isaac-text text-sm">{label}</span>
                  <span className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 flex-shrink-0 ${statusColor}`}>
                    {statusLabel}
                  </span>
                  {job.last_duration_s != null && !job.running && (
                    <span className="text-xs text-isaac-muted font-mono">{job.last_duration_s}s</span>
                  )}
                </div>
                <div className="flex gap-6 flex-shrink-0 text-xs text-isaac-muted tabular-nums">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider mb-0.5">Last run</div>
                    <div>{fmtAgo(job.last_run_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider mb-0.5">Next run</div>
                    <div>{fmtIn(job.next_run_at)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApiKeySection() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-api-key"],
    queryFn: fetchApiKey,
    refetchInterval: 30_000,
  });

  const handleRegenerate = async () => {
    const next = await regenerateApiKey();
    queryClient.setQueryData(["admin-api-key"], next);
  };

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresIn = data
    ? Math.max(0, Math.round((new Date(data.expires_at).getTime() - Date.now()) / 60_000))
    : null;

  return (
    <div className="space-y-3">
      <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">API Key</h2>
      <div className="border border-isaac-border p-4 space-y-3">
        {isLoading ? (
          <div className="text-isaac-muted text-sm animate-pulse">Loading…</div>
        ) : data ? (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/30 text-green-300 text-xs px-3 py-2 font-mono break-all">
                {data.api_key}
              </code>
              <button
                onClick={handleCopy}
                className="text-xs border border-isaac-border px-3 py-2 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-isaac-muted">
                Expires in {expiresIn} minute{expiresIn !== 1 ? "s" : ""}
              </span>
              <button
                onClick={handleRegenerate}
                className="text-xs border border-isaac-border px-3 py-1.5 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
              >
                Regenerate
              </button>
            </div>
            <div className="text-xs text-isaac-muted space-y-1">
              <div className="font-mono bg-black/30 px-3 py-2 text-green-300/70 break-all">
                curl -X POST https://yourdomain.com/api/scrape/today \<br />
                {"  "}-H "X-API-Key: {data.api_key}"
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}


export function AdminPanel() {
  const queryClient = useQueryClient();

  const { data: modsData, isLoading } = useQuery({
    queryKey: ["admin-moderators"],
    queryFn: fetchModerators,
  });

  const handleRevoke = async (steamId: string) => {
    await revokeModerator(steamId);
    queryClient.invalidateQueries({ queryKey: ["admin-moderators"] });
    queryClient.invalidateQueries({ queryKey: ["profile", steamId] });
  };

  const handleGrant = async (steamId: string) => {
    await grantModerator(steamId);
    queryClient.invalidateQueries({ queryKey: ["admin-moderators"] });
    queryClient.invalidateQueries({ queryKey: ["profile", steamId] });
  };

  const moderators = modsData?.moderators ?? [];

  return (
    <div className="space-y-8">
      {/* Scheduled jobs */}
      <ScheduledJobsSection />

      {/* API key */}
      <ApiKeySection />

      {/* Moderators list */}
      <div className="space-y-3">
        <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">
          Moderators
        </h2>
        {isLoading ? (
          <div className="text-center py-8 text-isaac-muted text-sm animate-pulse">Loading…</div>
        ) : moderators.length === 0 ? (
          <div className="text-center py-8 text-isaac-muted text-sm">No moderators assigned.</div>
        ) : (
          <div className="border border-isaac-border divide-y divide-isaac-border">
            {moderators.map((mod) => (
              <div key={mod.steam_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-isaac-text text-sm">
                    {mod.player_name ?? `[${mod.steam_id}]`}
                  </span>
                  <span className="ml-3 text-xs text-isaac-muted font-mono">{mod.steam_id}</span>
                </div>
                <button
                  onClick={() => handleRevoke(mod.steam_id)}
                  className="text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add moderator */}
      <div className="space-y-3">
        <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">
          Add Moderator
        </h2>
        <PlayerSearch onGrant={handleGrant} moderatorIds={new Set(moderators.map((m) => m.steam_id))} />
      </div>

      {/* All reports */}
      <AllReports />

      {/* All feedback */}
      <AllFeedback />
    </div>
  );
}

function PlayerSearch({
  onGrant,
  moderatorIds,
}: {
  onGrant: (steamId: string) => void;
  moderatorIds: Set<string>;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!input.trim()) { setQuery(""); return; }
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data } = useQuery({
    queryKey: ["admin-player-search", query],
    queryFn: () => adminSearchPlayers(query),
    enabled: query.length > 0,
    staleTime: 30_000,
  });

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
    <div ref={containerRef} className="relative max-w-md">
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search by name or Steam ID…"
        className="w-full bg-transparent border border-isaac-border text-isaac-text text-sm px-3 py-2 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent"
      />
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0.5 border border-isaac-border bg-isaac-bg shadow-lg">
          {results.map((r) => (
            <PlayerResult
              key={r.steam_id}
              result={r}
              isModerator={moderatorIds.has(r.steam_id)}
              onGrant={() => {
                onGrant(r.steam_id);
                setInput("");
                setQuery("");
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerResult({
  result,
  isModerator,
  onGrant,
}: {
  result: AdminPlayerResult;
  isModerator: boolean;
  onGrant: () => void;
}) {
  const label = result.player_name ?? `[${result.steam_id}]`;
  const isAdmin = result.role === "admin";

  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-isaac-border last:border-0 hover:bg-isaac-surface">
      <div className="min-w-0">
        <span className="text-isaac-text text-sm truncate">{label}</span>
        <span className="ml-2 text-xs text-isaac-muted font-mono">{result.steam_id}</span>
        {(isModerator || isAdmin) && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-isaac-accent border border-isaac-accent/50 px-1 py-0.5">
            {isAdmin ? "admin" : "mod"}
          </span>
        )}
      </div>
      {!isModerator && !isAdmin && (
        <button
          onMouseDown={(e) => { e.preventDefault(); onGrant(); }}
          className="flex-shrink-0 ml-3 text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
        >
          Make Moderator
        </button>
      )}
    </div>
  );
}

type StatusFilter = "all" | "pending" | "resolved" | "dismissed";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-400/50",
  resolved: "text-red-400 border-red-400/50",
  dismissed: "text-isaac-muted border-isaac-border",
};

const PAGE_SIZE = 50;

function AllReports() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-reports", statusFilter, page],
    queryFn: () => fetchAllReports(page, PAGE_SIZE, statusFilter === "all" ? undefined : statusFilter),
  });

  const handleFilterChange = (f: StatusFilter) => {
    setStatusFilter(f);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">
          All Reports
        </h2>
        {data && (
          <span className="text-xs text-isaac-muted">{data.total} total</span>
        )}
      </div>

      <div className="flex gap-1">
        {(["all", "pending", "resolved", "dismissed"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`text-xs px-3 py-1 border transition-colors capitalize ${
              statusFilter === f
                ? "border-isaac-accent text-isaac-accent"
                : "border-isaac-border text-isaac-muted hover:text-isaac-text"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-isaac-muted text-sm animate-pulse">Loading…</div>
      ) : isError ? (
        <div className="border border-isaac-accent bg-red-950/30 text-isaac-accent px-4 py-3 text-sm">
          {(error as Error).message}
        </div>
      ) : data?.reports.length === 0 ? (
        <div className="text-center py-8 text-isaac-muted text-sm">No reports found.</div>
      ) : (
        <>
          <div className="space-y-2">
            {data?.reports.map((report) => (
              <AdminReportRow key={report.id} report={report} />
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

function AdminReportRow({ report }: { report: ReportOut }) {
  const [expanded, setExpanded] = useState(false);
  const playerLabel = report.entry_player_name ?? `[${report.entry_steam_id}]`;
  const reporterLabel = report.reporter_name ?? `[${report.reporter_steam_id}]`;
  const reviewerLabel = report.reviewed_by_name ?? (report.reviewed_by_steam_id ? `[${report.reviewed_by_steam_id}]` : null);
  const colorClass = STATUS_COLORS[report.status] ?? "text-isaac-muted border-isaac-border";

  return (
    <div className="border border-isaac-border bg-isaac-surface">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-isaac-border/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`flex-shrink-0 text-[10px] uppercase tracking-wider border px-1.5 py-0.5 mt-0.5 ${colorClass}`}>
          {report.status}
        </span>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-xs text-isaac-muted">
            <span className="text-isaac-text">{reporterLabel}</span>
            {" → "}
            <span className="text-isaac-accent">{playerLabel}</span>
            {" · "}
            <span className="font-mono">{VERSION_LABELS[report.entry_version]}</span>
            {" · rank "}
            <span className="font-mono">{report.entry_rank}</span>
          </div>
          {reviewerLabel && report.reviewed_at && (
            <div className="text-xs text-isaac-muted">
              Reviewed by <span className="text-isaac-text">{reviewerLabel}</span>
              {" · "}
              <span className="font-mono">{format(parseISO(report.reviewed_at), "MMM d, yyyy HH:mm")}</span>
            </div>
          )}
          <div className="text-xs text-isaac-muted font-mono">
            {format(parseISO(report.created_at), "MMM d, yyyy HH:mm")}
          </div>
        </div>
        <span className="flex-shrink-0 text-xs text-isaac-muted">{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div className="px-4 pb-3 border-t border-isaac-border">
          <p className="text-sm text-isaac-text mt-3 border-l-2 border-isaac-border pl-3 whitespace-pre-wrap break-words">
            {report.reason}
          </p>
        </div>
      )}
    </div>
  );
}

type FeedbackStatusFilter = "all" | "open" | "closed";

const FEEDBACK_PAGE_SIZE = 20;

function AllFeedback() {
  const [statusFilter, setStatusFilter] = useState<FeedbackStatusFilter>("open");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-feedback", statusFilter, page],
    queryFn: () => fetchAllFeedback(page, FEEDBACK_PAGE_SIZE, statusFilter === "all" ? undefined : statusFilter),
  });

  const handleFilterChange = (f: FeedbackStatusFilter) => {
    setStatusFilter(f);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-title text-isaac-accent text-sm tracking-wide uppercase">
          Feedback
        </h2>
        {data && (
          <span className="text-xs text-isaac-muted">{data.total} total</span>
        )}
      </div>

      <div className="flex gap-1">
        {(["open", "closed", "all"] as FeedbackStatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`text-xs px-3 py-1 border transition-colors capitalize ${
              statusFilter === f
                ? "border-isaac-accent text-isaac-accent"
                : "border-isaac-border text-isaac-muted hover:text-isaac-text"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-isaac-muted text-sm animate-pulse">Loading…</div>
      ) : isError ? (
        <div className="border border-isaac-accent bg-red-950/30 text-isaac-accent px-4 py-3 text-sm">
          {(error as Error).message}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="text-center py-8 text-isaac-muted text-sm">No feedback found.</div>
      ) : (
        <>
          <div className="space-y-2">
            {data?.items.map((item) => (
              <FeedbackRow key={item.id} item={item} />
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

function FeedbackRow({ item }: { item: FeedbackItem }) {
  const [expanded, setExpanded] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const queryClient = useQueryClient();

  const threadQuery = useQuery({
    queryKey: ["feedback-thread", item.id],
    queryFn: () => fetchFeedbackThread(item.id),
    enabled: expanded,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["feedback-thread", item.id] });
    queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    queryClient.invalidateQueries({ queryKey: ["open-feedback-count"] });
  };

  const handleReply = async () => {
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addFeedbackMessage(item.id, replyBody.trim());
      setReplyBody("");
      invalidate();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setActing(true);
    try { await closeFeedback(item.id); invalidate(); } finally { setActing(false); }
  };

  const handleReopen = async () => {
    setActing(true);
    try { await reopenFeedback(item.id); invalidate(); } finally { setActing(false); }
  };

  const thread: FeedbackThread | undefined = threadQuery.data;
  const isOpen = (thread?.status ?? item.status) === "open";
  const authorLabel = item.author_name ?? `[${item.author_steam_id}]`;

  return (
    <div className="border border-isaac-border bg-isaac-surface">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-isaac-border/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`flex-shrink-0 text-[10px] uppercase tracking-wider border px-1.5 py-0.5 mt-0.5 ${
          item.status === "open"
            ? "text-green-400 border-green-400/50"
            : "text-isaac-muted border-isaac-border"
        }`}>
          {item.status}
        </span>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-xs text-isaac-text font-medium truncate">
            {item.subject ?? <span className="text-isaac-muted italic">no subject</span>}
          </div>
          <div className="text-xs text-isaac-muted">
            from <span className="text-isaac-text">{authorLabel}</span>
            {item.message_count > 0 && (
              <> · {item.message_count} {item.message_count === 1 ? "reply" : "replies"}</>
            )}
          </div>
          <div className="text-xs text-isaac-muted font-mono">
            {format(parseISO(item.created_at), "MMM d, yyyy HH:mm")}
          </div>
        </div>
        <span className="flex-shrink-0 text-xs text-isaac-muted">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="border-t border-isaac-border">
          {/* Original message */}
          <div className="px-4 py-3 border-b border-isaac-border">
            <p className="text-sm text-isaac-text whitespace-pre-wrap break-words">{item.body}</p>
          </div>

          {/* Thread messages */}
          {threadQuery.isLoading ? (
            <div className="px-4 py-3 text-xs text-isaac-muted animate-pulse">Loading thread…</div>
          ) : thread && thread.messages.length > 0 ? (
            <div className="divide-y divide-isaac-border">
              {thread.messages.map((msg) => {
                const isAdminMsg = msg.author_role === "admin" || msg.author_role === "moderator";
                return (
                  <div key={msg.id} className={`px-4 py-3 ${isAdminMsg ? "bg-isaac-accent/5" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${isAdminMsg ? "text-isaac-accent" : "text-isaac-text"}`}>
                        {msg.author_name ?? `[${msg.author_steam_id}]`}
                      </span>
                      {isAdminMsg && (
                        <span className="text-[10px] uppercase tracking-wider text-isaac-accent border border-isaac-accent/40 px-1 py-0.5">
                          {msg.author_role}
                        </span>
                      )}
                      <span className="text-xs text-isaac-muted font-mono ml-auto">
                        {format(parseISO(msg.created_at), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm text-isaac-text whitespace-pre-wrap break-words">{msg.body}</p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Reply form + actions */}
          <div className="px-4 py-3 border-t border-isaac-border space-y-2">
            {isOpen ? (
              <>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={2}
                  placeholder="Reply…"
                  className="w-full bg-transparent border border-isaac-border text-isaac-text text-sm px-3 py-2 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent resize-none"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClose(); }}
                    disabled={acting}
                    className="text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors disabled:opacity-40"
                  >
                    Close Thread
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReply(); }}
                    disabled={!replyBody.trim() || submitting}
                    className="text-xs border border-isaac-accent text-isaac-accent hover:bg-isaac-accent hover:text-black transition-colors px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Sending…" : "Reply"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-isaac-muted">Thread closed.</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReopen(); }}
                  disabled={acting}
                  className="text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors disabled:opacity-40"
                >
                  {acting ? "Reopening…" : "Reopen"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

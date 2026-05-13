import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  clearToken,
  fetchAvatars,
  fetchAvailableDates,
  fetchFollows,
  fetchFriendsLeaderboard,
  fetchLeaderboard,
  fetchMe,
  fetchOverallLeaderboard,
  fetchAllFeedback,
  fetchMyFeedback,
  fetchPendingReports,
  fetchPlayerRuns,
  fetchProfile,
  followPlayer,
  getToken,
  grantModerator,
  hideEntry,
  revokeModerator,
  setToken,
  submitReport,
  unfollowPlayer,
} from "./api/client";
import { DateSelector } from "./components/DateSelector";
import { Leaderboard } from "./components/Leaderboard";
import { ReportModal } from "./components/ReportModal";
import { OverallLeaderboard } from "./components/OverallLeaderboard";
import { Pagination } from "./components/Pagination";
import { PlayerProfile } from "./components/PlayerProfile";
import { ModPanel } from "./components/ModPanel";
import { AdminPanel } from "./components/AdminPanel";
import { UserProfile } from "./components/UserProfile";
import { PageSizeSelector, SortToggle } from "./components/Controls";
import { PlayerSearch } from "./components/PlayerSearch";
import { VersionTabs } from "./components/VersionTabs";
import { Footer } from "./components/Footer";
import { FeedbackModal } from "./components/FeedbackModal";
import { AboutPage } from "./components/AboutPage";
import { DailyCountsPage } from "./components/DailyCountsPage";
import type { GameVersion, SortType } from "./types";

type View = "daily" | "overall" | "profile" | "mod" | "admin" | "about" | "stats";

interface SelectedPlayer {
  steamId: string;
  playerName: string | null;
}

interface UrlState {
  view: View;
  version: GameVersion;
  sortType: SortType;
  selectedDate: string | null;
  selectedPlayer: SelectedPlayer | null;
  profileSteamId: string | null;
}

function readUrl(): UrlState {
  const segs = window.location.pathname.split("/").filter(Boolean);
  const isProfile = segs[0] === "profile";
  const isMod = segs[0] === "mod";
  const isAdmin = segs[0] === "admin";
  const isAbout = segs[0] === "about";
  const isStats = segs[0] === "stats";
  const view: View = isAdmin ? "admin" : isMod ? "mod" : isAbout ? "about" : isStats ? "stats" : isProfile ? "profile" : segs[0] === "overall" ? "overall" : "daily";
  const version = (!isProfile ? segs[1] as GameVersion : null) ?? "repentance_plus_solo";
  const sortType = (!isProfile ? segs[2] as SortType : null) ?? "score";
  const selectedDate = view === "daily" ? (segs[3] ?? null) : null;
  const selectedPlayer =
    view === "overall" && segs[3] === "player" && segs[4]
      ? { steamId: segs[4], playerName: null }
      : null;
  const profileSteamId = isProfile && segs[1] ? segs[1] : null;
  return { view, version, sortType, selectedDate, selectedPlayer, profileSteamId };
}

function writeUrl(s: UrlState, replace: boolean): void {
  let url: string;
  if (s.view === "admin") {
    url = "/admin";
  } else if (s.view === "mod") {
    url = "/mod";
  } else if (s.view === "about") {
    url = "/about";
  } else if (s.view === "stats") {
    url = "/stats";
  } else if (s.view === "profile" && s.profileSteamId) {
    url = `/profile/${s.profileSteamId}`;
  } else {
    const parts: string[] = [s.view, s.version, s.sortType];
    if (s.view === "daily" && s.selectedDate) parts.push(s.selectedDate);
    else if (s.view === "overall" && s.selectedPlayer) parts.push("player", s.selectedPlayer.steamId);
    url = `/${parts.join("/")}`;
  }
  if (replace) {
    history.replaceState(null, "", url);
  } else {
    history.pushState(null, "", url);
  }
}

export default function App() {
  const [view, setView] = useState<View>(() => readUrl().view);
  const [version, setVersion] = useState<GameVersion>(() => readUrl().version);
  const [sortType, setSortType] = useState<SortType>(() => readUrl().sortType);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => readUrl().selectedDate);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(() => readUrl().selectedPlayer);
  const [profileSteamId, setProfileSteamId] = useState<string | null>(() => readUrl().profileSteamId);

  // Track whether a token is stored (drives auth queries without re-reading localStorage every render)
  const [hasToken, setHasToken] = useState(() => !!getToken());

  // On mount: pull JWT from URL hash if Steam just redirected back
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#token=")) {
      const token = hash.slice(7);
      // Validate it looks like a JWT (three base64url segments) before storing
      if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
        setToken(token);
        setHasToken(true);
      }
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // Restore full state on back/forward
  useEffect(() => {
    const handler = () => {
      const s = readUrl();
      setView(s.view);
      setVersion(s.version);
      setSortType(s.sortType);
      setSelectedDate(s.selectedDate);
      setSelectedPlayer(s.selectedPlayer);
      setProfileSteamId(s.profileSteamId);
      setPage(1);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const snap = (): UrlState => ({ view, version, sortType, selectedDate, selectedPlayer, profileSteamId });

  const handleVersionChange = (v: GameVersion) => {
    writeUrl({ ...snap(), version: v, selectedDate: null, selectedPlayer: null }, false);
    setVersion(v); setSelectedDate(null); setSelectedPlayer(null); setPage(1);
  };
  const handleSortTypeChange = (s: SortType) => {
    writeUrl({ ...snap(), sortType: s, selectedPlayer: null }, false);
    setSortType(s); setSelectedPlayer(null); setPage(1);
  };
  const handleDateChange = (d: string) => {
    writeUrl({ ...snap(), selectedDate: d }, false);
    setSelectedDate(d); setPage(1);
  };
  const handlePageSizeChange = (n: number) => {
    setPageSize(n); setPage(1);
  };
  const handleViewChange = (v: View) => {
    writeUrl({ ...snap(), view: v, selectedPlayer: null, profileSteamId: null }, false);
    setView(v); setSelectedPlayer(null); setProfileSteamId(null); setPage(1);
  };
  const handleProfileClick = (steamId: string) => {
    writeUrl({ ...snap(), view: "profile", profileSteamId: steamId, selectedPlayer: null }, false);
    setView("profile"); setProfileSteamId(steamId); setSelectedPlayer(null);
  };
  const handleViewRunHistory = (steamId: string, version: GameVersion, sortType: SortType, playerName: string | null) => {
    const player = { steamId, playerName };
    writeUrl({ ...snap(), view: "overall", version, sortType, selectedPlayer: player, profileSteamId: null }, false);
    setView("overall"); setVersion(version); setSortType(sortType); setSelectedPlayer(player); setProfileSteamId(null);
  };
  const handlePageChange = (p: number) => {
    setPage(p);
  };

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: hasToken,
    retry: false,
  });
  const user = userQuery.data ?? null;

  const handleLogout = () => {
    clearToken();
    setHasToken(false);
    queryClient.removeQueries({ queryKey: ["me"] });
    queryClient.removeQueries({ queryKey: ["follows"] });
    queryClient.removeQueries({ queryKey: ["friends-leaderboard"] });
  };

  // ---------------------------------------------------------------------------
  // Follows
  // ---------------------------------------------------------------------------

  const followsQuery = useQuery({
    queryKey: ["follows"],
    queryFn: fetchFollows,
    enabled: !!user,
  });
  const followSet = new Set(followsQuery.data?.following ?? []);

  const handleFollow = async (steamId: string) => {
    await followPlayer(steamId);
    queryClient.invalidateQueries({ queryKey: ["follows"] });
    queryClient.invalidateQueries({ queryKey: ["friends-leaderboard"] });
  };
  const handleUnfollow = async (steamId: string) => {
    await unfollowPlayer(steamId);
    queryClient.invalidateQueries({ queryKey: ["follows"] });
    queryClient.invalidateQueries({ queryKey: ["friends-leaderboard"] });
  };

  const handleHide = async (entryId: number) => {
    await hideEntry(entryId);
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["friends-leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["player"] });
    queryClient.invalidateQueries({ queryKey: ["pending-reports-count"] });
  };

  const pendingReportsQuery = useQuery({
    queryKey: ["pending-reports-count"],
    queryFn: () => fetchPendingReports(1, 1),
    enabled: !!user?.role,
    refetchInterval: 60_000,
  });
  const pendingReportsCount = pendingReportsQuery.data?.total ?? 0;

  const openFeedbackQuery = useQuery({
    queryKey: ["open-feedback-count"],
    queryFn: () => fetchAllFeedback(1, 1, "open"),
    enabled: user?.role === "admin",
    refetchInterval: 60_000,
  });
  const openFeedbackCount = openFeedbackQuery.data?.total ?? 0;

  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const awaitingFeedbackQuery = useQuery({
    queryKey: ["my-feedback-count"],
    queryFn: () => fetchMyFeedback(1, 1),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const awaitingFeedbackCount = awaitingFeedbackQuery.data?.awaiting_count ?? 0;

  const [reportEntryId, setReportEntryId] = useState<number | null>(null);
  const [reportPlayerName, setReportPlayerName] = useState<string | null>(null);

  const handleReport = (entryId: number, playerName: string | null) => {
    setReportEntryId(entryId);
    setReportPlayerName(playerName);
  };

  const handleReportSubmit = async (entryId: number, reason: string) => {
    await submitReport(entryId, reason);
  };

  const handleReportClose = () => {
    setReportEntryId(null);
    setReportPlayerName(null);
  };

  const handleGrantModerator = async (steamId: string) => {
    await grantModerator(steamId);
    queryClient.invalidateQueries({ queryKey: ["profile", steamId] });
  };

  const handleRevokeModerator = async (steamId: string) => {
    await revokeModerator(steamId);
    queryClient.invalidateQueries({ queryKey: ["profile", steamId] });
  };

  // ---------------------------------------------------------------------------
  // Leaderboard data
  // ---------------------------------------------------------------------------

  const datesQuery = useQuery({
    queryKey: ["available-dates", version, sortType],
    queryFn: () => fetchAvailableDates(version, sortType),
    enabled: view === "daily",
  });

  const dates = datesQuery.data?.dates ?? [];
  const activeDate = selectedDate ?? dates[0] ?? null;

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", version, sortType, activeDate, page, pageSize],
    queryFn: () =>
      fetchLeaderboard({
        version,
        sort_type: sortType,
        date: activeDate ?? undefined,
        page,
        page_size: pageSize,
      }),
    enabled: view === "daily" && datesQuery.isSuccess,
  });

  const overallQuery = useQuery({
    queryKey: ["overall-leaderboard", version, sortType, page, pageSize],
    queryFn: () =>
      fetchOverallLeaderboard({
        version,
        sort_type: sortType,
        page,
        page_size: pageSize,
      }),
    enabled: view === "overall" && selectedPlayer === null,
    staleTime: 5 * 60_000,
  });

  const playerQuery = useQuery({
    queryKey: ["player", selectedPlayer?.steamId, version, sortType],
    queryFn: () =>
      fetchPlayerRuns({
        steam_id: selectedPlayer!.steamId,
        version,
        sort_type: sortType,
      }),
    enabled: selectedPlayer !== null,
    staleTime: 5 * 60_000,
  });

  const profileQuery = useQuery({
    queryKey: ["profile", profileSteamId],
    queryFn: () => fetchProfile(profileSteamId!),
    enabled: view === "profile" && profileSteamId !== null,
    staleTime: 5 * 60_000,
  });

  const friendsQuery = useQuery({
    queryKey: ["friends-leaderboard", version, sortType, activeDate],
    queryFn: () =>
      fetchFriendsLeaderboard({
        version,
        sort_type: sortType,
        date: activeDate ?? undefined,
      }),
    enabled: !!user && view === "daily",
  });
  const friendsEntries = friendsQuery.data?.entries ?? [];

  const lb = leaderboardQuery.data;
  const overall = overallQuery.data;
  const player = playerQuery.data;
  const pageOffset = lb ? (lb.page - 1) * lb.page_size : 0;

  // ---------------------------------------------------------------------------
  // Avatars
  // ---------------------------------------------------------------------------

  const avatarSteamIds = useMemo<string[]>(() => {
    if (view === "daily" && lb) return lb.entries.map((e) => e.steam_id);
    if (view === "overall" && selectedPlayer !== null && player) return [player.steam_id];
    if (view === "overall" && overall) return overall.entries.map((e) => e.steam_id);
    return [];
  }, [view, lb, overall, player, selectedPlayer]);

  const avatarQuery = useQuery({
    queryKey: ["avatars", avatarSteamIds],
    queryFn: () => fetchAvatars(avatarSteamIds),
    enabled: avatarSteamIds.length > 0,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
  const avatars = avatarQuery.data?.avatars ?? {};

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-isaac-bg text-isaac-text">
      {/* Header */}
      <header className="border-b border-isaac-border bg-isaac-surface">
        <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6 flex flex-wrap items-end justify-between gap-y-3">
          <div>
            <h1 className="font-title text-isaac-accent text-lg leading-relaxed tracking-wide">
              GreediestButt
            </h1>
            <p className="text-isaac-muted text-xs mt-1">
              The Binding of Isaac · Daily Run Leaderboards
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Daily / Overall toggle */}
            <div className="flex text-xs border border-isaac-border overflow-hidden">
              <button
                onClick={() => handleViewChange("daily")}
                className={`px-4 py-2 transition-colors ${
                  view === "daily"
                    ? "bg-isaac-accent text-isaac-bg font-bold"
                    : "bg-isaac-surface text-isaac-muted hover:text-isaac-text"
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => handleViewChange("overall")}
                className={`px-4 py-2 transition-colors border-l border-isaac-border ${
                  view === "overall"
                    ? "bg-isaac-accent text-isaac-bg font-bold"
                    : "bg-isaac-surface text-isaac-muted hover:text-isaac-text"
                }`}
              >
                Overall
              </button>
            </div>

            {/* Mod panel link */}
            {user?.role && (
              <button
                onClick={() => handleViewChange("mod")}
                className={`relative text-xs px-3 py-2 border transition-colors ${
                  view === "mod"
                    ? "border-isaac-accent text-isaac-accent"
                    : "border-isaac-border text-isaac-muted hover:text-isaac-text hover:border-isaac-accent"
                }`}
              >
                Mod
                {pendingReportsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-isaac-accent text-isaac-bg text-[10px] font-bold leading-4 text-center rounded-full">
                    {pendingReportsCount > 99 ? "99+" : pendingReportsCount}
                  </span>
                )}
              </button>
            )}
            {user?.role === "admin" && (
              <button
                onClick={() => handleViewChange("admin")}
                className={`relative text-xs px-3 py-2 border transition-colors ${
                  view === "admin"
                    ? "border-isaac-accent text-isaac-accent"
                    : "border-isaac-border text-isaac-muted hover:text-isaac-text hover:border-isaac-accent"
                }`}
              >
                Admin
                {openFeedbackCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-isaac-accent text-isaac-bg text-[10px] font-bold leading-4 text-center rounded-full">
                    {openFeedbackCount > 99 ? "99+" : openFeedbackCount}
                  </span>
                )}
              </button>
            )}

            {/* Feedback */}
            {user && (
              <button
                onClick={() => setFeedbackOpen(true)}
                className="relative text-xs px-3 py-2 border transition-colors border-isaac-border text-isaac-muted hover:text-isaac-text hover:border-isaac-accent"
              >
                Feedback
                {awaitingFeedbackCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-isaac-accent text-isaac-bg text-[10px] font-bold leading-4 text-center rounded-full">
                    {awaitingFeedbackCount > 99 ? "99+" : awaitingFeedbackCount}
                  </span>
                )}
              </button>
            )}

            {/* Auth */}
            {user ? (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => handleProfileClick(user.steam_id)}
                  className="flex items-center gap-2 text-isaac-muted hover:text-isaac-text transition-colors"
                >
                  {user.avatar_url?.startsWith("https://") && (
                    <img src={user.avatar_url} className="w-6 h-6" alt="" />
                  )}
                  <span className="max-w-[120px] truncate">
                    {user.player_name ?? `[${user.steam_id}]`}
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  className="text-isaac-muted hover:text-isaac-text transition-colors border border-isaac-border px-2 py-1"
                >
                  Log out
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/steam"
                className="text-xs border border-isaac-border px-3 py-2 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
              >
                Log in with Steam
              </a>
            )}
          </div>
        </div>
      </header>

      {!hasToken && (
        <div className="border-b border-green-800 bg-green-950/60">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
            <span className="text-green-300 text-sm">Sign in with Steam for more features</span>
            <a
              href="/api/auth/steam"
              className="text-xs border border-green-700 px-3 py-1.5 text-green-300 hover:text-green-100 hover:border-green-500 transition-colors whitespace-nowrap"
            >
              Log In
            </a>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {view !== "profile" && view !== "mod" && view !== "admin" && view !== "about" && view !== "stats" && selectedPlayer === null && <VersionTabs value={version} onChange={handleVersionChange} />}

        {view !== "profile" && view !== "mod" && view !== "admin" && view !== "about" && view !== "stats" && selectedPlayer === null && (
          <div className="flex flex-wrap gap-4 items-center justify-between border border-isaac-border bg-isaac-surface px-4 py-3">
            <div className="flex flex-wrap gap-4 items-center">
              <SortToggle value={sortType} onChange={handleSortTypeChange} />
              {view === "daily" && dates.length > 0 && (
                <DateSelector dates={dates} value={activeDate} onChange={handleDateChange} />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PlayerSearch version={version} sortType={sortType} onSelect={handleProfileClick} />
              <PageSizeSelector value={pageSize} onChange={handlePageSizeChange} />
            </div>
          </div>
        )}

        {view === "stats" ? (
          <DailyCountsPage />
        ) : view === "about" ? (
          <AboutPage currentUser={user} />
        ) : view === "admin" ? (
          <AdminPanel />
        ) : view === "mod" ? (
          <ModPanel />
        ) : view === "profile" ? (
          profileQuery.isLoading ? (
            <Loading />
          ) : profileQuery.isError ? (
            <ErrorMessage error={profileQuery.error} />
          ) : profileQuery.data ? (
            <UserProfile
              profile={profileQuery.data}
              currentUser={user}
              isFollowing={followSet.has(profileQuery.data.steam_id)}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              onGrantModerator={handleGrantModerator}
              onRevokeModerator={handleRevokeModerator}
              onViewRunHistory={handleViewRunHistory}
              onBack={() => window.history.back()}
            />
          ) : null
        ) : view === "daily" ? (
          <>
            {lb && (
              <div className="flex justify-between text-xs text-isaac-muted">
                <span>
                  {format(parseISO(lb.date), "MMMM d, yyyy")} ·{" "}
                  {lb.total_entries.toLocaleString()} players
                </span>
                <span>Page {lb.page} of {lb.total_pages}</span>
              </div>
            )}
            {leaderboardQuery.isLoading || datesQuery.isLoading ? (
              <Loading />
            ) : leaderboardQuery.isError ? (
              <ErrorMessage error={leaderboardQuery.error} />
            ) : datesQuery.isSuccess && dates.length === 0 ? (
              <EmptyState version={version} sortType={sortType} />
            ) : lb ? (
              <>
                <Leaderboard
                  entries={lb.entries}
                  sortType={lb.sort_type}
                  pageOffset={pageOffset}
                  avatars={avatars}
                  friendsEntries={friendsEntries}
                  currentUser={user}
                  follows={followSet}
                  onPlayerClick={handleProfileClick}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                  onHide={handleHide}
                  onReport={handleReport}
                />
                <Pagination page={lb.page} totalPages={lb.total_pages} onPageChange={handlePageChange} />
              </>
            ) : null}
          </>
        ) : selectedPlayer !== null ? (
          <>
            {playerQuery.isLoading ? (
              <Loading />
            ) : playerQuery.isError ? (
              <ErrorMessage error={playerQuery.error} />
            ) : player ? (
              <PlayerProfile
                steamId={player.steam_id}
                playerName={player.player_name}
                sortType={player.sort_type}
                entries={player.entries}
                onBack={() => window.history.back()}
                avatarUrl={avatars[player.steam_id]}
                currentUser={user}
                isFollowing={followSet.has(player.steam_id)}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                onHide={handleHide}
              />
            ) : null}
          </>
        ) : (
          <>
            {overall && (
              <div className="flex justify-between text-xs text-isaac-muted">
                <span>{overall.total_players.toLocaleString()} players · all-time</span>
                <span>Page {overall.page} of {overall.total_pages}</span>
              </div>
            )}
            {overallQuery.isLoading ? (
              <Loading />
            ) : overallQuery.isError ? (
              <ErrorMessage error={overallQuery.error} />
            ) : overall ? (
              <>
                <OverallLeaderboard
                  entries={overall.entries}
                  onPlayerClick={(steamId) => handleProfileClick(steamId)}
                  avatars={avatars}
                  currentUser={user}
                  follows={followSet}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                />
                <Pagination page={overall.page} totalPages={overall.total_pages} onPageChange={handlePageChange} />
              </>
            ) : null}
          </>
        )}
      </main>

      <Footer onAbout={() => handleViewChange("about")} onStats={() => handleViewChange("stats")} />

      {feedbackOpen && user && (
        <FeedbackModal currentUser={user} onClose={() => setFeedbackOpen(false)} />
      )}

      {reportEntryId !== null && (
        <ReportModal
          entryId={reportEntryId}
          playerName={reportPlayerName}
          onSubmit={handleReportSubmit}
          onClose={handleReportClose}
        />
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">
      Loading…
    </div>
  );
}

function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className="border border-isaac-accent bg-red-950/30 text-isaac-accent px-4 py-3 text-sm">
      {error.message}
    </div>
  );
}

function EmptyState({ version: _version, sortType }: { version: GameVersion; sortType: SortType }) {
  return (
    <div className="text-center py-16 text-isaac-muted text-sm space-y-2">
      <p>No {sortType} leaderboard data for this version yet.</p>
      <p className="text-xs">
        Run <code className="text-isaac-accent">POST /api/scrape/today</code> to
        fetch today&apos;s data, or{" "}
        <code className="text-isaac-accent">POST /api/scrape/seed</code> to
        import history.
      </p>
    </div>
  );
}

import type {
  AboutContent,
  AdminPlayerSearchResponse,
  AvatarsResponse,
  AvailableDatesResponse,
  DailyCountsResponse,
  EntryDetail,
  FeedbackItem,
  FeedbackListResponse,
  FeedbackMessage,
  FeedbackThread,
  FriendsLeaderboardResponse,
  FollowsResponse,
  GameVersion,
  HiddenEntriesResponse,
  LeaderboardResponse,
  ModeratorsResponse,
  OverallLeaderboardResponse,
  PlayerHiddenRun,
  PlayerResponse,
  ProfileResponse,
  ReportsResponse,
  SchedulerStatusResponse,
  SearchResponse,
  SortType,
  StatsResponse,
  User,
} from "../types";

const BASE = "/api";

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem("steam_token");
}

export function setToken(token: string): void {
  localStorage.setItem("steam_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("steam_token");
}

// ---------------------------------------------------------------------------
// Base fetch
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options?: { method?: string; body?: string },
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options?.body) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method: options?.method ?? "GET",
    headers,
    body: options?.body,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Entry detail
// ---------------------------------------------------------------------------

export function fetchEntry(id: number): Promise<EntryDetail> {
  return apiFetch<EntryDetail>(`${BASE}/entry/${id}`);
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export function fetchLeaderboard(params: {
  version: GameVersion;
  sort_type: SortType;
  date?: string;
  page: number;
  page_size: number;
}): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>(`${BASE}/leaderboard`, {
    version: params.version,
    sort_type: params.sort_type,
    date: params.date,
    page: params.page,
    page_size: params.page_size,
  });
}

export function fetchOverallLeaderboard(params: {
  version: GameVersion;
  sort_type: SortType;
  min_runs?: number;
  page: number;
  page_size: number;
}): Promise<OverallLeaderboardResponse> {
  return apiFetch<OverallLeaderboardResponse>(`${BASE}/overall-leaderboard`, {
    version: params.version,
    sort_type: params.sort_type,
    min_runs: params.min_runs,
    page: params.page,
    page_size: params.page_size,
  });
}

export function fetchPlayerRuns(params: {
  steam_id: string;
  version: GameVersion;
  sort_type: SortType;
}): Promise<PlayerResponse> {
  return apiFetch<PlayerResponse>(`${BASE}/player/${params.steam_id}`, {
    version: params.version,
    sort_type: params.sort_type,
  });
}

export function fetchAvailableDates(
  version: GameVersion,
  sort_type: SortType,
): Promise<AvailableDatesResponse> {
  return apiFetch<AvailableDatesResponse>(`${BASE}/available-dates`, {
    version,
    sort_type,
  });
}

export function fetchAvatars(steamIds: string[]): Promise<AvatarsResponse> {
  if (steamIds.length === 0) return Promise.resolve({ avatars: {} });
  return apiFetch<AvatarsResponse>(`${BASE}/avatars`, {
    steam_ids: steamIds.join(","),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function fetchMe(): Promise<User> {
  return apiFetch<User>(`${BASE}/auth/me`);
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export function fetchFollows(): Promise<FollowsResponse> {
  return apiFetch<FollowsResponse>(`${BASE}/follows`);
}

export function followPlayer(steamId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/follows/${steamId}`, undefined, { method: "POST" });
}

export function unfollowPlayer(steamId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/follows/${steamId}`, undefined, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Player profile
// ---------------------------------------------------------------------------

export function fetchProfile(steamId: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>(`${BASE}/profile/${steamId}`);
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export function hideEntry(entryId: number, source: "direct" | "report" = "direct"): Promise<void> {
  return apiFetch<void>(`${BASE}/mod/entries/${entryId}/hide?source=${source}`, undefined, { method: "POST" });
}

export function unhideEntry(entryId: number): Promise<void> {
  return apiFetch<void>(`${BASE}/mod/entries/${entryId}/hide`, undefined, { method: "DELETE" });
}

export function fetchModerators(): Promise<ModeratorsResponse> {
  return apiFetch<ModeratorsResponse>(`${BASE}/mod/moderators`);
}

export function adminSearchPlayers(q: string): Promise<AdminPlayerSearchResponse> {
  return apiFetch<AdminPlayerSearchResponse>(`${BASE}/mod/players/search`, { q });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function submitReport(entryId: number, reason: string): Promise<void> {
  return apiFetch<void>(`${BASE}/reports/${entryId}`, undefined, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function fetchPendingReports(page: number, pageSize: number): Promise<ReportsResponse> {
  return apiFetch<ReportsResponse>(`${BASE}/mod/reports`, { page, page_size: pageSize });
}

export function dismissReport(reportId: number): Promise<void> {
  return apiFetch<void>(`${BASE}/mod/reports/${reportId}/dismiss`, undefined, { method: "POST" });
}

export function fetchAllReports(page: number, pageSize: number, status?: string): Promise<ReportsResponse> {
  return apiFetch<ReportsResponse>(`${BASE}/mod/all-reports`, { page, page_size: pageSize, status });
}

export function grantModerator(steamId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/mod/users/${steamId}/moderator`, undefined, { method: "POST" });
}

export function revokeModerator(steamId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/mod/users/${steamId}/moderator`, undefined, { method: "DELETE" });
}

export function fetchHiddenEntries(page: number, pageSize: number): Promise<HiddenEntriesResponse> {
  return apiFetch<HiddenEntriesResponse>(`${BASE}/mod/hidden-entries`, { page, page_size: pageSize });
}

export function unbanPlayer(steamId: string): Promise<void> {
  return apiFetch<void>(`${BASE}/mod/players/${steamId}/unban`, undefined, { method: "POST" });
}

export function fetchPlayerHiddenRuns(params: {
  steam_id: string;
  version: GameVersion;
  sort_type: SortType;
}): Promise<{ entries: PlayerHiddenRun[] }> {
  return apiFetch<{ entries: PlayerHiddenRun[] }>(`${BASE}/mod/players/${params.steam_id}/hidden-runs`, {
    version: params.version,
    sort_type: params.sort_type,
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function fetchStats(): Promise<StatsResponse> {
  return apiFetch<StatsResponse>(`${BASE}/stats`);
}

export function searchPlayers(params: {
  q: string;
  version: GameVersion;
  sort_type: SortType;
}): Promise<SearchResponse> {
  return apiFetch<SearchResponse>(`${BASE}/search`, {
    q: params.q,
    version: params.version,
    sort_type: params.sort_type,
  });
}

// ---------------------------------------------------------------------------
// Friends leaderboard
// ---------------------------------------------------------------------------

export function fetchFriendsLeaderboard(params: {
  version: GameVersion;
  sort_type: SortType;
  date?: string;
}): Promise<FriendsLeaderboardResponse> {
  return apiFetch<FriendsLeaderboardResponse>(`${BASE}/friends-leaderboard`, {
    version: params.version,
    sort_type: params.sort_type,
    date: params.date,
  });
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function submitFeedback(subject: string | null, body: string): Promise<FeedbackItem> {
  return apiFetch<FeedbackItem>(`${BASE}/feedback`, undefined, {
    method: "POST",
    body: JSON.stringify({ subject, body }),
  });
}

export function fetchMyFeedback(page: number, pageSize: number): Promise<FeedbackListResponse> {
  return apiFetch<FeedbackListResponse>(`${BASE}/feedback/mine`, { page, page_size: pageSize });
}

export function fetchAllFeedback(page: number, pageSize: number, status?: string): Promise<FeedbackListResponse> {
  return apiFetch<FeedbackListResponse>(`${BASE}/feedback`, { page, page_size: pageSize, status });
}

export function fetchFeedbackThread(id: number): Promise<FeedbackThread> {
  return apiFetch<FeedbackThread>(`${BASE}/feedback/${id}`);
}

export function addFeedbackMessage(id: number, body: string): Promise<FeedbackMessage> {
  return apiFetch<FeedbackMessage>(`${BASE}/feedback/${id}/messages`, undefined, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function closeFeedback(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}/feedback/${id}/close`, undefined, { method: "POST" });
}

export function reopenFeedback(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}/feedback/${id}/reopen`, undefined, { method: "POST" });
}

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

export function fetchAbout(): Promise<AboutContent> {
  return apiFetch<AboutContent>(`${BASE}/about`);
}

export function updateAbout(content: string): Promise<void> {
  return apiFetch<void>(`${BASE}/about`, undefined, { method: "PUT", body: JSON.stringify({ content }) });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function fetchDailyCounts(): Promise<DailyCountsResponse> {
  return apiFetch<DailyCountsResponse>(`${BASE}/stats/daily-counts`);
}

// ---------------------------------------------------------------------------
// Admin API key
// ---------------------------------------------------------------------------

export interface ApiKeyResponse {
  api_key: string;
  expires_at: string;
}

export function fetchApiKey(): Promise<ApiKeyResponse> {
  return apiFetch<ApiKeyResponse>(`${BASE}/admin/api-key`);
}

export function regenerateApiKey(): Promise<ApiKeyResponse> {
  return apiFetch<ApiKeyResponse>(`${BASE}/admin/api-key/regenerate`, undefined, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Scheduler status
// ---------------------------------------------------------------------------

export function fetchSchedulerStatus(): Promise<SchedulerStatusResponse> {
  return apiFetch<SchedulerStatusResponse>(`${BASE}/admin/scheduler`);
}

export function triggerScrapeToday(): Promise<void> {
  return apiFetch<void>(`${BASE}/scrape/today`, undefined, { method: "POST" });
}

export function triggerBackfillNames(): Promise<void> {
  return apiFetch<void>(`${BASE}/scrape/backfill-names`, undefined, { method: "POST" });
}

export function triggerRefreshStats(): Promise<void> {
  return apiFetch<void>(`${BASE}/scrape/refresh-stats`, undefined, { method: "POST" });
}

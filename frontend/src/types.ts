export type GameVersion =
  | "afterbirth"
  | "afterbirth_plus"
  | "repentance"
  | "repentance_plus_solo"
  | "repentance_plus_coop";

export type SortType = "score" | "time";

export interface LeaderboardEntry {
  id: number;
  rank: number;
  steam_id: string;
  player_name: string | null;
  value: number | null;
  hidden: boolean;
  stage_bonus: number | null;
  schwag_bonus: number | null;
  bluebaby_bonus: number | null;
  lamb_bonus: number | null;
  megasatan_bonus: number | null;
  rush_bonus: number | null;
  exploration_bonus: number | null;
  damage_penalty: number | null;
  time_penalty: number | null;
  item_penalty: number | null;
  level: number | null;
  time_taken: number | null;
  goal: number | null;
}

export interface PlayerRun extends LeaderboardEntry {
  date: string;
}

export interface EntryDetail extends LeaderboardEntry {
  date: string;
  version: GameVersion;
  sort_type: SortType;
  total_entries: number | null;
}

export interface PlayerResponse {
  steam_id: string;
  player_name: string | null;
  version: GameVersion;
  sort_type: SortType;
  entries: PlayerRun[];
}

export interface OverallEntry {
  rank: number;
  steam_id: string;
  player_name: string | null;
  runs_played: number;
  avg_rank: number;
  best_rank: number;
  wins: number;
}

export interface OverallLeaderboardResponse {
  version: GameVersion;
  sort_type: SortType;
  total_players: number;
  page: number;
  page_size: number;
  total_pages: number;
  entries: OverallEntry[];
}

export interface LeaderboardResponse {
  date: string;
  version: GameVersion;
  sort_type: SortType;
  total_entries: number;
  page: number;
  page_size: number;
  total_pages: number;
  entries: LeaderboardEntry[];
}

export interface AvailableDatesResponse {
  version: GameVersion;
  sort_type: SortType;
  dates: string[];
}

export interface AvatarsResponse {
  avatars: Record<string, string>;
}

export interface User {
  steam_id: string;
  player_name: string | null;
  avatar_url: string | null;
  role: "admin" | "moderator" | null;
}

export interface FollowsResponse {
  following: string[];
}

export interface FriendsLeaderboardResponse {
  entries: LeaderboardEntry[];
}

export interface ReportSummary {
  reporter_name: string | null;
  reason: string;
  created_at: string;
}

export interface HiddenEntry {
  id: number;
  steam_id: string;
  player_name: string | null;
  rank: number;
  value: number | null;
  time_taken: number | null;
  date: string;
  version: GameVersion;
  sort_type: SortType;
  hidden_by: string | null;
  hidden_by_name: string | null;
  hidden_at: string | null;
  hidden_source: "direct" | "report" | "automod" | null;
  reports: ReportSummary[];
  auto_banned: boolean;
  level: number | null;
  stage_bonus: number | null;
  schwag_bonus: number | null;
  bluebaby_bonus: number | null;
  lamb_bonus: number | null;
  megasatan_bonus: number | null;
  rush_bonus: number | null;
  exploration_bonus: number | null;
  damage_penalty: number | null;
  time_penalty: number | null;
  item_penalty: number | null;
}

export interface HiddenEntriesResponse {
  entries: HiddenEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProfileRunTypeStats {
  version: GameVersion;
  sort_type: SortType;
  runs_played: number;
  avg_rank: number;
  best_rank: number;
  wins: number;
  current_streak: number;
  current_streak_type: "win" | "loss" | null;
  longest_win_streak: number;
  longest_loss_streak: number;
}

export interface ProfileResponse {
  steam_id: string;
  player_name: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  role: string | null;
  stats: ProfileRunTypeStats[];
}

export interface ReportOut {
  id: number;
  entry_id: number;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  entry_player_name: string | null;
  entry_steam_id: string;
  entry_rank: number;
  entry_version: GameVersion;
  entry_sort_type: SortType;
  entry_date: string;
  reporter_steam_id: string;
  reporter_name: string | null;
  reviewed_by_steam_id: string | null;
  reviewed_by_name: string | null;
}

export interface ReportsResponse {
  reports: ReportOut[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ModeratorEntry {
  steam_id: string;
  player_name: string | null;
}

export interface ModeratorsResponse {
  moderators: ModeratorEntry[];
}

export interface AdminPlayerResult {
  steam_id: string;
  player_name: string | null;
  role: string | null;
}

export interface AdminPlayerSearchResponse {
  results: AdminPlayerResult[];
}

export interface SearchResult {
  steam_id: string;
  player_name: string | null;
  runs_played: number;
  best_rank: number;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface FeedbackItem {
  id: number;
  author_steam_id: string;
  author_name: string | null;
  subject: string | null;
  body: string;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  message_count: number;
  awaiting_user: boolean;
}

export interface FeedbackMessage {
  id: number;
  author_steam_id: string;
  author_name: string | null;
  author_role: string | null;
  body: string;
  created_at: string;
}

export interface FeedbackThread extends FeedbackItem {
  messages: FeedbackMessage[];
}

export interface FeedbackListResponse {
  items: FeedbackItem[];
  total: number;
  awaiting_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const VERSION_LABELS: Record<GameVersion, string> = {
  afterbirth: "Afterbirth",
  afterbirth_plus: "Afterbirth+",
  repentance: "Repentance",
  repentance_plus_solo: "Repentance+ Solo",
  repentance_plus_coop: "Repentance+ Coop",
};

export interface StatsResponse {
  total_entries: number;
  total_players: number;
  last_scraped_at: string | null;
}

export interface DailyCountPoint {
  date: string;
  count: number;
}

export interface DailyCountsResponse {
  versions: Partial<Record<GameVersion, DailyCountPoint[]>>;
}

export interface AboutContent {
  content: string;
}

export interface SchedulerJob {
  id: string;
  next_run_at: string | null;
  running: boolean;
  last_run_at: string | null;
  last_status: "ok" | "error" | null;
  last_duration_s: number | null;
}

export interface SchedulerStatusResponse {
  jobs: SchedulerJob[];
}

export const VERSION_ORDER: GameVersion[] = [
  "repentance_plus_solo",
  "repentance_plus_coop",
  "repentance",
  "afterbirth_plus",
  "afterbirth",
];

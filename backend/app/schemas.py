from datetime import date, datetime

from pydantic import BaseModel, field_serializer

from .models import GameVersion, SortType


class LeaderboardEntryOut(BaseModel):
    id: int
    rank: int
    steam_id: int
    player_name: str | None = None

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)
    value: int | None
    hidden: bool = False

    details: str | None = None
    stage_bonus: int | None = None
    schwag_bonus: int | None = None
    bluebaby_bonus: int | None = None
    lamb_bonus: int | None = None
    megasatan_bonus: int | None = None
    rush_bonus: int | None = None
    exploration_bonus: int | None = None
    damage_penalty: int | None = None
    time_penalty: int | None = None
    item_penalty: int | None = None
    level: int | None = None
    time_taken: int | None = None
    goal: int | None = None

    model_config = {"from_attributes": True}


class LeaderboardResponse(BaseModel):
    date: date
    version: GameVersion
    sort_type: SortType
    total_entries: int
    page: int
    page_size: int
    total_pages: int
    entries: list[LeaderboardEntryOut]


class AvailableDatesResponse(BaseModel):
    version: GameVersion
    sort_type: SortType
    dates: list[date]


class RawLeaderboard(BaseModel):
    steam_leaderboard_id: int
    name: str
    entry_count: int
    sort_method: int  # 1 = descending (score), 2 = ascending (time)
    detected_date: date | None
    detected_version: GameVersion | None
    detected_sort_type: SortType | None


class EntryDetailOut(LeaderboardEntryOut):
    date: date
    version: GameVersion
    sort_type: SortType
    total_entries: int | None = None


class PlayerRunEntry(LeaderboardEntryOut):
    date: date


class PlayerResponse(BaseModel):
    steam_id: int
    player_name: str | None
    version: GameVersion
    sort_type: SortType
    entries: list[PlayerRunEntry]

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class OverallEntry(BaseModel):
    rank: int
    steam_id: int
    player_name: str | None
    runs_played: int
    avg_rank: float
    best_rank: int
    wins: int

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class OverallLeaderboardResponse(BaseModel):
    version: GameVersion
    sort_type: SortType
    total_players: int
    page: int
    page_size: int
    total_pages: int
    entries: list[OverallEntry]


class AvatarsResponse(BaseModel):
    avatars: dict[str, str]


class UserOut(BaseModel):
    steam_id: int
    player_name: str | None
    avatar_url: str | None
    role: str | None = None

    model_config = {"from_attributes": True}

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class FollowsResponse(BaseModel):
    following: list[str]


class FriendsLeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntryOut]


class ReportSummary(BaseModel):
    reporter_name: str | None
    reason: str
    created_at: datetime


class HiddenEntryOut(BaseModel):
    id: int
    steam_id: int
    player_name: str | None
    rank: int
    value: int | None
    time_taken: int | None
    date: date
    version: GameVersion
    sort_type: SortType
    hidden_by: int | None
    hidden_by_name: str | None
    hidden_at: datetime | None
    hidden_source: str | None
    reports: list[ReportSummary] = []
    auto_banned: bool
    level: int | None = None
    stage_bonus: int | None = None
    schwag_bonus: int | None = None
    bluebaby_bonus: int | None = None
    lamb_bonus: int | None = None
    megasatan_bonus: int | None = None
    rush_bonus: int | None = None
    exploration_bonus: int | None = None
    damage_penalty: int | None = None
    time_penalty: int | None = None
    item_penalty: int | None = None

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)

    @field_serializer("hidden_by")
    def _hidden_by_str(self, v: int | None) -> str | None:
        return str(v) if v is not None else None


class HiddenEntriesResponse(BaseModel):
    entries: list[HiddenEntryOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProfileRunTypeStats(BaseModel):
    version: GameVersion
    sort_type: SortType
    runs_played: int
    avg_rank: float
    best_rank: int
    wins: int
    current_streak: int = 0
    current_streak_type: str | None = None
    longest_win_streak: int = 0
    longest_loss_streak: int = 0


class SearchResult(BaseModel):
    steam_id: int
    player_name: str | None
    runs_played: int
    best_rank: int

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class SearchResponse(BaseModel):
    results: list[SearchResult]


class ProfileResponse(BaseModel):
    steam_id: int
    player_name: str | None
    avatar_url: str | None
    follower_count: int
    following_count: int
    role: str | None
    stats: list[ProfileRunTypeStats]

    model_config = {"from_attributes": True}

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class ModeratorEntry(BaseModel):
    steam_id: int
    player_name: str | None

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class ModeratorsResponse(BaseModel):
    moderators: list[ModeratorEntry]


class AdminPlayerResult(BaseModel):
    steam_id: int
    player_name: str | None
    role: str | None

    @field_serializer("steam_id")
    def _steam_id_str(self, v: int) -> str:
        return str(v)


class AdminPlayerSearchResponse(BaseModel):
    results: list[AdminPlayerResult]


class ReportCreate(BaseModel):
    reason: str

    def validate_reason(self) -> "ReportCreate":
        if len(self.reason.strip()) < 20:
            raise ValueError("Reason must be at least 20 characters")
        return self


class ReportOut(BaseModel):
    id: int
    entry_id: int
    reason: str
    status: str
    created_at: datetime
    reviewed_at: datetime | None
    # Entry context
    entry_player_name: str | None
    entry_steam_id: int
    entry_rank: int
    entry_version: str
    entry_sort_type: str
    entry_date: date
    # Reporter
    reporter_steam_id: int
    reporter_name: str | None
    # Reviewer (mod/admin who acted on it)
    reviewed_by_steam_id: int | None
    reviewed_by_name: str | None

    @field_serializer("entry_steam_id")
    def _entry_steam_id_str(self, v: int) -> str:
        return str(v)

    @field_serializer("reporter_steam_id")
    def _reporter_steam_id_str(self, v: int) -> str:
        return str(v)

    @field_serializer("reviewed_by_steam_id")
    def _reviewed_by_str(self, v: int | None) -> str | None:
        return str(v) if v is not None else None


class ReportsResponse(BaseModel):
    reports: list[ReportOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class ScrapeResult(BaseModel):
    runs_created: int
    runs_updated: int
    entries_upserted: int
    message: str


class StatsResponse(BaseModel):
    total_entries: int
    total_players: int
    last_scraped_at: datetime | None


class DailyCountPoint(BaseModel):
    date: str
    count: int


class DailyCountsResponse(BaseModel):
    versions: dict[str, list[DailyCountPoint]]


class FeedbackCreate(BaseModel):
    subject: str | None = None
    body: str


class FeedbackMessageCreate(BaseModel):
    body: str


class FeedbackMessageOut(BaseModel):
    id: int
    author_steam_id: str
    author_name: str | None
    author_role: str | None
    body: str
    created_at: datetime

    @field_serializer("author_steam_id")
    def _sid_str(self, v: str) -> str:
        return str(v)


class FeedbackOut(BaseModel):
    id: int
    author_steam_id: str
    author_name: str | None
    subject: str | None
    body: str
    status: str
    created_at: datetime
    closed_at: datetime | None
    message_count: int
    awaiting_user: bool = False

    @field_serializer("author_steam_id")
    def _sid_str(self, v: str) -> str:
        return str(v)


class FeedbackThreadOut(BaseModel):
    id: int
    author_steam_id: str
    author_name: str | None
    subject: str | None
    body: str
    status: str
    created_at: datetime
    closed_at: datetime | None
    messages: list[FeedbackMessageOut]

    @field_serializer("author_steam_id")
    def _sid_str(self, v: str) -> str:
        return str(v)


class FeedbackListResponse(BaseModel):
    items: list[FeedbackOut]
    total: int
    awaiting_count: int
    page: int
    page_size: int
    total_pages: int


class AboutContent(BaseModel):
    content: str

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/greediest_butt"
    steam_api_key: str = ""
    isaac_app_id: int = 250900
    cors_origins: list[str] = ["http://localhost:5173"]
    # URL the browser uses to reach the app (frontend origin in dev, same origin in prod)
    app_url: str = "http://localhost:5173"
    # Secret used to sign session JWTs — override in production
    session_secret: str = "changeme-set-SESSION_SECRET-in-production"

    # Per-(version, sort_type) regex patterns matched against Steam leaderboard names.
    # Each pattern must uniquely identify one board. Defaults assume time boards
    # contain the word "time"; calibrate via GET /api/admin/leaderboard-discovery.
    afterbirth_score_pattern: str = r"(?i)afterbirth(?!\+|plus|_plus)(?!.*\btime\b)"
    afterbirth_time_pattern: str = r"(?i)afterbirth(?!\+|plus|_plus).*\btime\b"
    afterbirth_plus_score_pattern: str = r"(?i)afterbirth(\+|plus|_plus)(?!.*\btime\b)"
    afterbirth_plus_time_pattern: str = r"(?i)afterbirth(\+|plus|_plus).*\btime\b"
    repentance_score_pattern: str = r"(?i)repentance(?!\+|plus|_plus)(?!.*\btime\b)"
    repentance_time_pattern: str = r"(?i)repentance(?!\+|plus|_plus).*\btime\b"
    repentance_plus_solo_score_pattern: str = r"(?i)repentance(\+|plus|_plus)(?!.*(co.?op))(?!.*\btime\b)"
    repentance_plus_solo_time_pattern: str = r"(?i)repentance(\+|plus|_plus)(?!.*(co.?op)).*\btime\b"
    repentance_plus_coop_score_pattern: str = r"(?i)repentance(\+|plus|_plus).*(co.?op)(?!.*\btime\b)"
    repentance_plus_coop_time_pattern: str = r"(?i)repentance(\+|plus|_plus).*(co.?op).*\btime\b"


settings = Settings()

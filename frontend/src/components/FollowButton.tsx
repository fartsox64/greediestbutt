import { useState } from "react";

interface Props {
  steamId: string;
  isFollowing: boolean;
  onFollow: (steamId: string) => void;
  onUnfollow: (steamId: string) => void;
}

export function FollowButton({ steamId, isFollowing, onFollow, onUnfollow }: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (isFollowing) {
        await onUnfollow(steamId);
      } else {
        await onFollow(steamId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={isFollowing ? "Unfollow" : "Follow"}
      className={`text-lg w-10 h-10 flex items-center justify-center transition-colors ${
        isFollowing
          ? "text-isaac-accent hover:text-isaac-muted"
          : "text-isaac-muted hover:text-isaac-accent"
      } ${busy ? "opacity-50 cursor-default" : ""}`}
    >
      {isFollowing ? "★" : "☆"}
    </button>
  );
}

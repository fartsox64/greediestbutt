import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  entryId: number;
  playerName: string | null;
  onSubmit: (entryId: number, reason: string) => Promise<void>;
  onClose: () => void;
}

const MIN_REASON_LENGTH = 20;

export function ReportModal({ entryId, playerName, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = reason.trim();
  const remaining = MIN_REASON_LENGTH - trimmed.length;
  const canSubmit = trimmed.length >= MIN_REASON_LENGTH && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(entryId, trimmed);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const label = playerName ?? `[${entryId}]`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-isaac-bg border border-isaac-border w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-isaac-border">
          <h2 className="font-title text-isaac-accent text-sm uppercase tracking-wide">
            Report Score
          </h2>
          <button
            onClick={onClose}
            className="text-isaac-muted hover:text-isaac-text transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {done ? (
            <div className="space-y-4">
              <p className="text-isaac-text text-sm">
                Report submitted for <span className="text-isaac-accent">{label}</span>. A moderator will review it.
              </p>
              <button
                onClick={onClose}
                className="w-full border border-isaac-border text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors text-sm py-2"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <p className="text-isaac-muted text-xs">
                Reporting score by <span className="text-isaac-text">{label}</span>.
                Describe why you believe this score was achieved through cheating.
              </p>

              <div className="space-y-1">
                <textarea
                  ref={textareaRef}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder="Explain why you suspect cheating…"
                  className="w-full bg-transparent border border-isaac-border text-isaac-text text-sm px-3 py-2 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent resize-none"
                />
                {remaining > 0 && (
                  <p className="text-xs text-isaac-muted text-right">
                    {remaining} more character{remaining !== 1 ? "s" : ""} required
                  </p>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-400 border border-red-400/40 px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={onClose}
                  className="border border-isaac-border text-isaac-muted hover:text-isaac-text transition-colors text-sm px-4 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="border border-isaac-accent text-isaac-accent hover:bg-isaac-accent hover:text-black transition-colors text-sm px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting…" : "Submit Report"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  addFeedbackMessage,
  closeFeedback,
  fetchFeedbackThread,
  fetchMyFeedback,
  submitFeedback,
} from "../api/client";
import type { FeedbackItem, FeedbackThread, User } from "../types";

interface Props {
  currentUser: User;
  onClose: () => void;
}

type View = "list" | "new" | "thread";

export function FeedbackModal({ currentUser, onClose }: Props) {
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () => fetchMyFeedback(1, 20),
  });

  const threadQuery = useQuery({
    queryKey: ["feedback-thread", selectedId],
    queryFn: () => fetchFeedbackThread(selectedId!),
    enabled: view === "thread" && selectedId !== null,
  });

  const handleSelectThread = (id: number) => {
    setSelectedId(id);
    setView("thread");
  };

  const handleBack = () => {
    setView("list");
    setSelectedId(null);
  };

  const handleSubmitNew = async (subject: string | null, body: string) => {
    await submitFeedback(subject, body);
    queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
    setView("list");
  };

  const handleAddMessage = async (body: string) => {
    await addFeedbackMessage(selectedId!, body);
    queryClient.invalidateQueries({ queryKey: ["feedback-thread", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["my-feedback-count"] });
  };

  const handleClose = async () => {
    await closeFeedback(selectedId!);
    queryClient.invalidateQueries({ queryKey: ["feedback-thread", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
    queryClient.invalidateQueries({ queryKey: ["my-feedback-count"] });
  };

  const title =
    view === "new" ? "New Feedback" :
    view === "thread" ? (threadQuery.data?.subject ?? "Feedback") :
    "Your Feedback";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-isaac-bg border border-isaac-border w-full max-w-lg mx-4 shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-isaac-border flex-shrink-0">
          <div className="flex items-center gap-3">
            {(view === "new" || view === "thread") && (
              <button
                onClick={handleBack}
                className="text-isaac-muted hover:text-isaac-text transition-colors text-xs"
              >
                ← Back
              </button>
            )}
            <h2 className="font-title text-isaac-accent text-sm uppercase tracking-wide truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {view === "list" && (
              <button
                onClick={() => setView("new")}
                className="text-xs border border-isaac-border px-2 py-1 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
              >
                + New
              </button>
            )}
            <button
              onClick={onClose}
              className="text-isaac-muted hover:text-isaac-text transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {view === "list" && (
            <FeedbackList
              items={listQuery.data?.items ?? []}
              isLoading={listQuery.isLoading}
              onSelect={handleSelectThread}
              onNew={() => setView("new")}
            />
          )}
          {view === "new" && (
            <NewFeedbackForm
              onSubmit={handleSubmitNew}
              onCancel={handleBack}
            />
          )}
          {view === "thread" && (
            threadQuery.isLoading ? (
              <div className="text-center py-12 text-isaac-muted text-sm animate-pulse">Loading…</div>
            ) : threadQuery.data ? (
              <ThreadView
                thread={threadQuery.data}
                currentUserId={currentUser.steam_id}
                isAdmin={currentUser.role === "admin"}
                onAddMessage={handleAddMessage}
                onClose={handleClose}
              />
            ) : null
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FeedbackList({
  items,
  isLoading,
  onSelect,
  onNew,
}: {
  items: FeedbackItem[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  if (isLoading) {
    return <div className="text-center py-12 text-isaac-muted text-sm animate-pulse">Loading…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center px-5">
        <p className="text-isaac-muted text-sm">You haven't submitted any feedback yet.</p>
        <button
          onClick={onNew}
          className="text-xs border border-isaac-accent px-3 py-1.5 text-isaac-accent hover:bg-isaac-accent hover:text-black transition-colors"
        >
          Send Feedback
        </button>
      </div>
    );
  }
  return (
    <div className="divide-y divide-isaac-border">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className="w-full text-left px-5 py-4 hover:bg-isaac-surface transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 flex-shrink-0 ${
                  item.status === "open"
                    ? "text-green-400 border-green-400/50"
                    : "text-isaac-muted border-isaac-border"
                }`}>
                  {item.status}
                </span>
                {item.awaiting_user && (
                  <span className="text-[10px] text-isaac-accent border border-isaac-accent/50 px-1.5 py-0.5 flex-shrink-0">reply</span>
                )}
                {!item.awaiting_user && item.message_count > 0 && (
                  <span className="text-[10px] text-isaac-muted">{item.message_count} {item.message_count === 1 ? "reply" : "replies"}</span>
                )}
              </div>
              {item.subject && (
                <p className="text-sm text-isaac-text font-medium truncate">{item.subject}</p>
              )}
              <p className="text-xs text-isaac-muted truncate">{item.body}</p>
            </div>
            <span className="text-xs text-isaac-muted font-mono flex-shrink-0">
              {format(parseISO(item.created_at), "MMM d")}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function NewFeedbackForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (subject: string | null, body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = body.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(subject.trim() || null, body.trim());
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-isaac-muted mb-1">Subject (optional)</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary…"
            maxLength={200}
            className="w-full bg-transparent border border-isaac-border text-isaac-text text-sm px-3 py-2 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-isaac-muted mb-1">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Describe your feedback, bug report, or suggestion…"
            className="w-full bg-transparent border border-isaac-border text-isaac-text text-sm px-3 py-2 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent resize-none"
            autoFocus
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 border border-red-400/40 px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="border border-isaac-border text-isaac-muted hover:text-isaac-text transition-colors text-sm px-4 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="border border-isaac-accent text-isaac-accent hover:bg-isaac-accent hover:text-black transition-colors text-sm px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending…" : "Send Feedback"}
        </button>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  currentUserId,
  isAdmin,
  onAddMessage,
  onClose,
}: {
  thread: FeedbackThread;
  currentUserId: string;
  isAdmin: boolean;
  onAddMessage: (body: string) => Promise<void>;
  onClose: () => Promise<void>;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = thread.status === "open";
  const canAct = isAdmin || thread.author_steam_id === currentUserId;

  const handleReply = async () => {
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAddMessage(replyBody.trim());
      setReplyBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await onClose();
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Original message */}
      <div className="px-5 py-4 border-b border-isaac-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-isaac-muted font-mono">
            {format(parseISO(thread.created_at), "MMM d, yyyy HH:mm")}
          </span>
          <span className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 ${
            isOpen ? "text-green-400 border-green-400/50" : "text-isaac-muted border-isaac-border"
          }`}>
            {thread.status}
          </span>
        </div>
        <p className="text-sm text-isaac-text whitespace-pre-wrap break-words">{thread.body}</p>
      </div>

      {/* Replies */}
      {thread.messages.length > 0 && (
        <div className="divide-y divide-isaac-border">
          {thread.messages.map((msg) => {
            const isOwn = msg.author_steam_id === currentUserId;
            const isAdminMsg = msg.author_role === "admin" || msg.author_role === "moderator";
            return (
              <div
                key={msg.id}
                className={`px-5 py-3 ${isAdminMsg ? "bg-isaac-accent/5" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${isAdminMsg ? "text-isaac-accent" : "text-isaac-text"}`}>
                    {isAdminMsg ? "Site Admins" : (msg.author_name ?? `[${msg.author_steam_id}]`)}
                  </span>
                  {isAdminMsg && (
                    <span className="text-[10px] uppercase tracking-wider text-isaac-accent border border-isaac-accent/40 px-1 py-0.5">
                      {msg.author_role}
                    </span>
                  )}
                  {isOwn && !isAdminMsg && (
                    <span className="text-[10px] text-isaac-muted">you</span>
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
      )}

      {/* Reply form & actions */}
      <div className="px-5 py-4 border-t border-isaac-border space-y-3">
        {isOpen && canAct && (
          <>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              placeholder="Add a reply…"
              className="w-full bg-transparent border border-isaac-border text-isaac-text text-sm px-3 py-2 placeholder-isaac-muted focus:outline-none focus:border-isaac-accent resize-none"
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={handleClose}
                disabled={closing}
                className="text-xs border border-isaac-border px-3 py-1.5 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors disabled:opacity-40"
              >
                {closing ? "Closing…" : "Close Thread"}
              </button>
              <button
                onClick={handleReply}
                disabled={!replyBody.trim() || submitting}
                className="text-xs border border-isaac-accent text-isaac-accent hover:bg-isaac-accent hover:text-black transition-colors px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending…" : "Reply"}
              </button>
            </div>
          </>
        )}
        {!isOpen && canAct && (
          <p className="text-xs text-isaac-muted text-center">This thread is closed.</p>
        )}
        {!canAct && (
          <p className="text-xs text-isaac-muted text-center">Read-only.</p>
        )}
      </div>
    </div>
  );
}

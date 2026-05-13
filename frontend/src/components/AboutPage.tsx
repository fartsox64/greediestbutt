import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { fetchAbout, updateAbout } from "../api/client";
import type { User } from "../types";

interface Props {
  currentUser: User | null;
}

export function AboutPage({ currentUser }: Props) {
  const isAdmin = currentUser?.role === "admin";
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["about"],
    queryFn: fetchAbout,
  });

  const content = data?.content ?? "";

  if (isLoading) {
    return <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      {isAdmin && (
        <div className="flex justify-end mb-4">
          {editing ? null : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs border border-isaac-border px-3 py-1.5 text-isaac-muted hover:text-isaac-text hover:border-isaac-accent transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {editing && isAdmin ? (
        <AboutEditor
          initialContent={content}
          onSave={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <AboutViewer content={content} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only view
// ---------------------------------------------------------------------------

function AboutViewer({ content }: { content: string }) {
  const editor = useEditor({
    extensions: [StarterKit, Link, Markdown],
    content,
    editable: false,
  });

  if (!content) {
    return (
      <div className="text-center py-16 text-isaac-muted text-sm">
        Nothing here yet.
      </div>
    );
  }

  return (
    <div className="isaac-prose">
      <EditorContent editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor (admin only)
// ---------------------------------------------------------------------------

function AboutEditor({
  initialContent,
  onSave,
  onCancel,
}: {
  initialContent: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    ],
    content: initialContent,
    editable: true,
  });

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    setError(null);
    try {
      const markdown = editor.storage.markdown.getMarkdown();
      await updateAbout(markdown);
      queryClient.invalidateQueries({ queryKey: ["about"] });
      onSave();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-isaac-border">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-isaac-border bg-isaac-surface">
        <ToolbarGroup>
          <ToolBtn
            label="B"
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="font-bold"
          />
          <ToolBtn
            label="I"
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="italic"
          />
          <ToolBtn
            label="S"
            title="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className="line-through"
          />
        </ToolbarGroup>

        <ToolbarSep />

        <ToolbarGroup>
          <ToolBtn label="H1" title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolBtn label="H2" title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolBtn label="H3" title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        </ToolbarGroup>

        <ToolbarSep />

        <ToolbarGroup>
          <ToolBtn label="•" title="Bullet list"   active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolBtn label="1." title="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        </ToolbarGroup>

        <ToolbarSep />

        <ToolbarGroup>
          <ToolBtn label="❝" title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolBtn label="`"  title="Inline code" active={editor.isActive("code")}       onClick={() => editor.chain().focus().toggleCode().run()} />
          <ToolBtn label="```" title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        </ToolbarGroup>

        <ToolbarSep />

        <ToolbarGroup>
          <ToolBtn label="🔗" title="Link" active={editor.isActive("link")} onClick={setLink} />
          <ToolBtn label="—"  title="Horizontal rule" active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        </ToolbarGroup>

        <ToolbarSep />

        <ToolbarGroup>
          <ToolBtn label="↩" title="Undo" active={false} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
          <ToolBtn label="↪" title="Redo" active={false} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
        </ToolbarGroup>
      </div>

      {/* Editor area */}
      <div className="tiptap-editor isaac-prose p-4 min-h-96 cursor-text" onClick={() => editor.commands.focus()}>
        <EditorContent editor={editor} />
      </div>

      {error && (
        <p className="text-xs text-red-400 border-t border-red-400/40 px-4 py-2">{error}</p>
      )}

      {/* Footer actions */}
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-isaac-border bg-isaac-surface">
        <button
          onClick={onCancel}
          className="text-xs border border-isaac-border px-4 py-1.5 text-isaac-muted hover:text-isaac-text transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs border border-isaac-accent px-4 py-1.5 text-isaac-accent hover:bg-isaac-accent hover:text-black transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar primitives
// ---------------------------------------------------------------------------

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-0.5">{children}</div>;
}

function ToolbarSep() {
  return <div className="w-px bg-isaac-border mx-1 self-stretch" />;
}

function ToolBtn({
  label,
  title,
  active,
  onClick,
  disabled,
  className = "",
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "px-2 py-1 text-xs min-w-[1.75rem] transition-colors border",
        active
          ? "border-isaac-accent text-isaac-accent bg-isaac-accent/10"
          : "border-transparent text-isaac-muted hover:text-isaac-text hover:border-isaac-border",
        disabled ? "opacity-30 cursor-not-allowed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      {label}
    </button>
  );
}

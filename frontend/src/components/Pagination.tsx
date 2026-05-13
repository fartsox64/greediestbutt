interface Props {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <div className="flex items-center gap-1 justify-center mt-6">
      <PageBtn
        label="«"
        disabled={page === 1}
        onClick={() => onPageChange(1)}
        title="First page"
      />
      <PageBtn
        label="‹"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        title="Previous page"
      />

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-isaac-muted select-none">
            …
          </span>
        ) : (
          <PageBtn
            key={p}
            label={String(p)}
            active={p === page}
            onClick={() => onPageChange(p as number)}
          />
        )
      )}

      <PageBtn
        label="›"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        title="Next page"
      />
      <PageBtn
        label="»"
        disabled={page === totalPages}
        onClick={() => onPageChange(totalPages)}
        title="Last page"
      />
    </div>
  );
}

interface PageBtnProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}

function PageBtn({ label, onClick, disabled, active, title }: PageBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "min-w-[2rem] px-2 py-1 text-sm border transition-colors",
        active
          ? "bg-isaac-accent border-isaac-accent text-white font-bold cursor-default"
          : disabled
          ? "border-isaac-border text-isaac-border cursor-not-allowed"
          : "border-isaac-border text-isaac-muted hover:border-isaac-accent hover:text-isaac-text",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function buildPageList(current: number, total: number): (number | "...")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [];
  const addRange = (start: number, end: number) => {
    for (let i = start; i <= end; i++) pages.push(i);
  };

  pages.push(1);
  if (current > 4) pages.push("...");
  addRange(Math.max(2, current - 2), Math.min(total - 1, current + 2));
  if (current < total - 3) pages.push("...");
  pages.push(total);

  return pages;
}

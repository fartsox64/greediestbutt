import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

interface Props {
  dates: string[];
  value: string | null;
  onChange: (d: string) => void;
}

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type CalView = "days" | "months" | "years";

export function DateSelector({ dates, value, onChange }: Props) {
  const activeDate = value ?? dates[0] ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [calView, setCalView] = useState<CalView>("days");
  const [displayMonth, setDisplayMonth] = useState<Date>(() =>
    activeDate ? parseISO(activeDate) : new Date()
  );
  // decade start year for the years grid (multiples of 12)
  const [decadeBase, setDecadeBase] = useState(() => {
    const y = activeDate ? parseISO(activeDate).getFullYear() : new Date().getFullYear();
    return Math.floor(y / 12) * 12;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeDate) setDisplayMonth(parseISO(activeDate));
  }, [activeDate]);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const availableSet = useMemo(() => new Set(dates), [dates]);
  const availableMonthSet = useMemo(() => new Set(dates.map((d) => d.slice(0, 7))), [dates]);
  const availableYearSet = useMemo(() => new Set(dates.map((d) => d.slice(0, 4))), [dates]);

  if (dates.length === 0) return null;

  const displayYear = displayMonth.getFullYear();
  const displayMonthIdx = displayMonth.getMonth();

  // ── Days view helpers ──────────────────────────────────────────────────────
  const monthStart = startOfMonth(displayMonth);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(displayMonth)) });

  const handleDayClick = (iso: string) => {
    if (availableSet.has(iso)) { onChange(iso); setIsOpen(false); }
  };

  // ── Month view helpers ─────────────────────────────────────────────────────
  const handleMonthSelect = (monthIdx: number) => {
    setDisplayMonth(new Date(displayYear, monthIdx, 1));
    setCalView("days");
  };

  // ── Year view helpers ──────────────────────────────────────────────────────
  const yearGridYears = Array.from({ length: 12 }, (_, i) => decadeBase + i);

  const handleYearSelect = (year: number) => {
    // jump to first available month in that year, or keep current month index
    const firstInYear = dates.find((d) => d.startsWith(String(year)));
    setDisplayMonth(firstInYear ? parseISO(firstInYear) : new Date(year, displayMonthIdx, 1));
    setCalView("months");
  };

  // ── Header content ─────────────────────────────────────────────────────────
  let prevAction: () => void;
  let nextAction: () => void;
  let headerLabel: React.ReactNode;

  if (calView === "days") {
    prevAction = () => setDisplayMonth((m) => subMonths(m, 1));
    nextAction = () => setDisplayMonth((m) => addMonths(m, 1));
    headerLabel = (
      <>
        <button
          onClick={() => setCalView("months")}
          className="text-isaac-text text-xs font-bold uppercase tracking-widest hover:text-isaac-accent transition-colors"
        >
          {format(displayMonth, "MMMM")}
        </button>
        <button
          onClick={() => { setDecadeBase(Math.floor(displayYear / 12) * 12); setCalView("years"); }}
          className="text-isaac-text text-xs font-bold uppercase tracking-widest hover:text-isaac-accent transition-colors"
        >
          {displayYear}
        </button>
      </>
    );
  } else if (calView === "months") {
    prevAction = () => setDisplayMonth((m) => new Date(m.getFullYear() - 1, m.getMonth(), 1));
    nextAction = () => setDisplayMonth((m) => new Date(m.getFullYear() + 1, m.getMonth(), 1));
    headerLabel = (
      <button
        onClick={() => { setDecadeBase(Math.floor(displayYear / 12) * 12); setCalView("years"); }}
        className="text-isaac-text text-xs font-bold uppercase tracking-widest hover:text-isaac-accent transition-colors"
      >
        {displayYear}
      </button>
    );
  } else {
    prevAction = () => setDecadeBase((b) => b - 12);
    nextAction = () => setDecadeBase((b) => b + 12);
    headerLabel = (
      <span className="text-isaac-text text-xs font-bold uppercase tracking-widest">
        {decadeBase} – {decadeBase + 11}
      </span>
    );
  }

  const activeDateIdx = activeDate ? dates.indexOf(activeDate) : -1;
  // dates is sorted descending; higher index = older day
  const prevDate = activeDateIdx !== -1 && activeDateIdx < dates.length - 1 ? dates[activeDateIdx + 1] : null;
  const nextDate = activeDateIdx > 0 ? dates[activeDateIdx - 1] : null;

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <span className="text-isaac-muted text-xs uppercase tracking-widest">Date</span>

      <button
        onClick={() => prevDate && onChange(prevDate)}
        disabled={!prevDate}
        title="Previous day"
        className="border border-isaac-border text-isaac-muted text-xs px-2 py-1.5 hover:text-isaac-text hover:border-isaac-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ‹
      </button>

      <button
        onClick={() => setIsOpen((o) => !o)}
        className="bg-isaac-surface border border-isaac-border text-isaac-text text-sm px-2 py-1.5 focus:outline-none focus:border-isaac-accent hover:border-isaac-accent transition-colors flex items-center gap-2"
      >
        <span>{activeDate ? format(parseISO(activeDate), "MMM d, yyyy") : "Select date"}</span>
        <span className={`text-isaac-muted text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
      </button>

      <button
        onClick={() => nextDate && onChange(nextDate)}
        disabled={!nextDate}
        title="Next day"
        className="border border-isaac-border text-isaac-muted text-xs px-2 py-1.5 hover:text-isaac-text hover:border-isaac-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ›
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-isaac-surface border border-isaac-border shadow-xl select-none w-64">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-isaac-border">
            <button
              onClick={prevAction}
              className="text-isaac-muted hover:text-isaac-text transition-colors w-6 text-center"
            >
              ‹
            </button>
            <div className="flex items-center gap-2">
              {headerLabel}
            </div>
            <button
              onClick={nextAction}
              className="text-isaac-muted hover:text-isaac-text transition-colors w-6 text-center"
            >
              ›
            </button>
          </div>

          {/* Days grid */}
          {calView === "days" && (
            <>
              <div className="grid grid-cols-7 px-2 pt-2">
                {DAY_HEADERS.map((h) => (
                  <div key={h} className="text-center text-[10px] text-isaac-muted uppercase tracking-widest py-1">
                    {h}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 px-2 pb-3">
                {days.map((day) => {
                  const iso = format(day, "yyyy-MM-dd");
                  const isAvailable = availableSet.has(iso);
                  const isSelected = activeDate === iso;
                  const inMonth = isSameMonth(day, displayMonth);
                  return (
                    <button
                      key={iso}
                      disabled={!isAvailable}
                      onClick={() => handleDayClick(iso)}
                      className={[
                        "text-xs py-1.5 text-center transition-colors leading-none",
                        !inMonth ? "opacity-20" : "",
                        isSelected
                          ? "bg-isaac-accent text-black font-bold"
                          : isAvailable
                          ? "text-isaac-text hover:bg-isaac-border cursor-pointer"
                          : "text-isaac-muted cursor-default",
                      ].filter(Boolean).join(" ")}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Months grid */}
          {calView === "months" && (
            <div className="grid grid-cols-3 gap-1 p-3">
              {MONTH_NAMES.map((name, idx) => {
                const monthKey = `${displayYear}-${String(idx + 1).padStart(2, "0")}`;
                const hasData = availableMonthSet.has(monthKey);
                const isCurrent = idx === displayMonthIdx;
                return (
                  <button
                    key={name}
                    disabled={!hasData}
                    onClick={() => handleMonthSelect(idx)}
                    className={[
                      "py-2 text-xs text-center transition-colors",
                      isCurrent
                        ? "bg-isaac-accent text-black font-bold"
                        : hasData
                        ? "text-isaac-text hover:bg-isaac-border cursor-pointer"
                        : "text-isaac-muted cursor-default opacity-40",
                    ].filter(Boolean).join(" ")}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Years grid */}
          {calView === "years" && (
            <div className="grid grid-cols-4 gap-1 p-3">
              {yearGridYears.map((year) => {
                const hasData = availableYearSet.has(String(year));
                const isCurrent = year === displayYear;
                return (
                  <button
                    key={year}
                    disabled={!hasData}
                    onClick={() => handleYearSelect(year)}
                    className={[
                      "py-2 text-xs text-center transition-colors",
                      isCurrent
                        ? "bg-isaac-accent text-black font-bold"
                        : hasData
                        ? "text-isaac-text hover:bg-isaac-border cursor-pointer"
                        : "text-isaac-muted cursor-default opacity-40",
                    ].filter(Boolean).join(" ")}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

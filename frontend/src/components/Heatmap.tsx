import { useMemo } from "react";
import { parseISO, format, eachDayOfInterval, subYears, startOfDay } from "date-fns";

interface Props {
  dates: Record<string, number>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Heatmap({ dates }: Props) {
  const { weeks, months } = useMemo(() => {
    const end = startOfDay(new Date());
    const start = subYears(end, 1);
    const allDays = eachDayOfInterval({ start, end });

    // Pad to start on Sunday
    const firstDow = allDays[0].getDay();
    const padded: (Date | null)[] = Array(firstDow).fill(null).concat(allDays);

    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }

    // Month labels: find first day of each month in the grid
    const seen = new Set<string>();
    const months: { col: number; label: string }[] = [];
    weeks.forEach((week, col) => {
      week.forEach((day) => {
        if (!day) return;
        const key = format(day, "yyyy-MM");
        if (!seen.has(key)) {
          seen.add(key);
          months.push({ col, label: format(day, "MMM") });
        }
      });
    });

    return { weeks, months };
  }, []);

  const maxCount = Math.max(1, ...Object.values(dates));

  function cellColor(day: Date | null): string {
    if (!day) return "transparent";
    const key = format(day, "yyyy-MM-dd");
    const count = dates[key] ?? 0;
    if (count === 0) return "bg-isaac-border";
    const intensity = count / maxCount;
    if (intensity < 0.34) return "bg-isaac-accent/30";
    if (intensity < 0.67) return "bg-isaac-accent/60";
    return "bg-isaac-accent";
  }

  return (
    <div className="space-y-1 overflow-x-auto">
      {/* Month labels */}
      <div className="flex gap-px ml-7" style={{ minWidth: weeks.length * 13 }}>
        {weeks.map((_, col) => {
          const m = months.find((m) => m.col === col);
          return (
            <div key={col} className="w-3 text-[9px] text-isaac-muted shrink-0">
              {m?.label ?? ""}
            </div>
          );
        })}
      </div>
      {/* Grid */}
      <div className="flex gap-1">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-px mr-1">
          {DAYS.map((d, i) => (
            <div key={d} className={`text-[9px] text-isaac-muted h-3 leading-3 ${i % 2 === 0 ? "invisible" : ""}`}>
              {d[0]}
            </div>
          ))}
        </div>
        {/* Cells */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-px">
            {week.map((day, di) => (
              <div
                key={di}
                title={day ? `${format(day, "MMM d, yyyy")}${dates[format(day, "yyyy-MM-dd")] ? ` · ${dates[format(day, "yyyy-MM-dd")]} run${dates[format(day, "yyyy-MM-dd")] > 1 ? "s" : ""}` : ""}` : undefined}
                className={`w-3 h-3 shrink-0 ${cellColor(day)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

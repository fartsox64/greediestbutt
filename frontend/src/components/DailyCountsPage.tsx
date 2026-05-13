import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fetchDailyCounts } from "../api/client";
import type { GameVersion } from "../types";
import { VERSION_LABELS, VERSION_ORDER } from "../types";

// Chart geometry
const W = 900;
const H = 400;
const M = { top: 20, right: 20, bottom: 56, left: 72 };
const IW = W - M.left - M.right;
const IH = H - M.top - M.bottom;

// Colors per version (order matches VERSION_ORDER)
const VERSION_COLORS: Record<GameVersion, string> = {
  repentance_plus_solo: "#DAA520",
  repentance_plus_coop: "#4ade80",
  repentance: "#60a5fa",
  afterbirth_plus: "#f87171",
  afterbirth: "#c084fc",
};

function niceMax(v: number): number {
  if (v === 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const normalized = v / mag;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * mag;
}

function yTicks(max: number): number[] {
  const step = max / 4;
  return [0, step, step * 2, step * 3, max];
}

export function DailyCountsPage() {
  const query = useQuery({
    queryKey: ["daily-counts"],
    queryFn: fetchDailyCounts,
    staleTime: 5 * 60_000,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const { allDates, series, maxCount } = useMemo(() => {
    const data = query.data?.versions ?? {};
    const dateSet = new Set<string>();
    for (const version of VERSION_ORDER) {
      for (const pt of data[version] ?? []) dateSet.add(pt.date);
    }
    const allDates = [...dateSet].sort();

    const series = VERSION_ORDER.map((version) => {
      const pts = data[version] ?? [];
      const map = new Map(pts.map((p) => [p.date, p.count]));
      return { version, map };
    }).filter((s) => s.map.size > 0);

    const maxCount = niceMax(
      Math.max(0, ...VERSION_ORDER.flatMap((v) => (data[v] ?? []).map((p) => p.count)))
    );

    return { allDates, series, maxCount };
  }, [query.data]);

  const xScale = (i: number) => allDates.length < 2 ? IW / 2 : (i / (allDates.length - 1)) * IW;
  const yScale = (v: number) => IH - (v / maxCount) * IH;

  // Hover: find nearest date index by x position
  const nearestIdx = useMemo(() => {
    if (hoverX === null || allDates.length === 0) return null;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < allDates.length; i++) {
      const dist = Math.abs(xScale(i) - hoverX);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }, [hoverX, allDates, xScale]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const chartX = svgX - M.left;
    if (chartX < 0 || chartX > IW) { setHoverX(null); return; }
    setHoverX(chartX);
  };

  // X-axis tick every ~90px worth of dates
  const tickEvery = Math.max(1, Math.round(allDates.length / (IW / 90)));
  const xTickIndices = allDates.map((_, i) => i).filter((i) => i % tickEvery === 0 || i === allDates.length - 1);

  const ticks = yTicks(maxCount);

  if (query.isLoading) {
    return <div className="text-center py-16 text-isaac-muted text-sm animate-pulse">Loading…</div>;
  }
  if (query.isError) {
    return <div className="border border-isaac-accent bg-red-950/30 text-isaac-accent px-4 py-3 text-sm">{(query.error as Error).message}</div>;
  }
  if (allDates.length === 0) {
    return <div className="text-center py-16 text-isaac-muted text-sm">No data yet.</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-isaac-text text-sm font-bold uppercase tracking-widest">Daily Participant Count by Version</h2>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {series.map(({ version }) => (
          <div key={version} className="flex items-center gap-1.5 text-xs text-isaac-muted">
            <span className="w-5 h-0.5 inline-block" style={{ backgroundColor: VERSION_COLORS[version] }} />
            {VERSION_LABELS[version]}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="border border-isaac-border bg-isaac-surface p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverX(null)}
        >
          <g transform={`translate(${M.left},${M.top})`}>
            {/* Y grid + axis */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={IW} y1={yScale(t)} y2={yScale(t)} stroke="#2e2e2e" strokeWidth={1} />
                <text x={-8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" fill="#888" fontSize={11}>
                  {t >= 1000 ? `${(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}k` : t}
                </text>
              </g>
            ))}

            {/* X axis ticks */}
            {xTickIndices.map((i) => (
              <g key={i} transform={`translate(${xScale(i)},${IH})`}>
                <line y1={0} y2={5} stroke="#2e2e2e" strokeWidth={1} />
                <text
                  y={16}
                  textAnchor="middle"
                  fill="#888"
                  fontSize={10}
                  transform={`rotate(-35, 0, 16)`}
                >
                  {format(parseISO(allDates[i]), "MMM d")}
                </text>
              </g>
            ))}

            {/* Axes border */}
            <line x1={0} x2={0} y1={0} y2={IH} stroke="#2e2e2e" strokeWidth={1} />
            <line x1={0} x2={IW} y1={IH} y2={IH} stroke="#2e2e2e" strokeWidth={1} />

            {/* Lines */}
            {series.map(({ version, map }) => {
              // Build segments (skip gaps)
              const segments: string[][] = [];
              let current: string[] = [];
              allDates.forEach((d, i) => {
                if (map.has(d)) {
                  current.push(`${xScale(i)},${yScale(map.get(d)!)}`);
                } else if (current.length) {
                  segments.push(current);
                  current = [];
                }
              });
              if (current.length) segments.push(current);

              return segments.map((seg, si) => (
                <polyline
                  key={`${version}-${si}`}
                  points={seg.join(" ")}
                  fill="none"
                  stroke={VERSION_COLORS[version]}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ));
            })}

            {/* Hover crosshair */}
            {nearestIdx !== null && (
              <>
                <line
                  x1={xScale(nearestIdx)}
                  x2={xScale(nearestIdx)}
                  y1={0}
                  y2={IH}
                  stroke="#555"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {series.map(({ version, map }) => {
                  const d = allDates[nearestIdx];
                  if (!map.has(d)) return null;
                  const count = map.get(d)!;
                  return (
                    <circle
                      key={version}
                      cx={xScale(nearestIdx)}
                      cy={yScale(count)}
                      r={3}
                      fill={VERSION_COLORS[version]}
                    />
                  );
                })}
              </>
            )}
          </g>

          {/* Tooltip */}
          {nearestIdx !== null && (() => {
            const d = allDates[nearestIdx];
            const tooltipX = M.left + xScale(nearestIdx);
            const rows = series.filter(({ map }) => map.has(d));
            const boxW = 160;
            const boxH = 16 + rows.length * 18 + 8;
            const rawX = tooltipX + 12;
            const clampedX = rawX + boxW > W ? tooltipX - boxW - 12 : rawX;
            const clampedY = M.top;

            return (
              <g transform={`translate(${clampedX},${clampedY})`}>
                <rect x={0} y={0} width={boxW} height={boxH} fill="#1a1a1a" stroke="#2e2e2e" rx={2} />
                <text x={8} y={14} fill="#e8e8e8" fontSize={11} fontWeight="bold">
                  {format(parseISO(d), "MMM d, yyyy")}
                </text>
                {rows.map(({ version, map }, ri) => (
                  <g key={version} transform={`translate(8,${16 + ri * 18})`}>
                    <rect x={0} y={3} width={10} height={3} fill={VERSION_COLORS[version]} />
                    <text x={14} y={10} fill="#e8e8e8" fontSize={10}>
                      {VERSION_LABELS[version]}: {map.get(d)!.toLocaleString()}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

"use client";

interface DayData {
  label: string; // "Mon", "Tue", etc.
  date: string;  // ISO date string
  hours: number;
}

interface ReportChartProps {
  data: DayData[];
  title?: string;
}

export function ReportChart({ data, title = "Past 7 Days" }: ReportChartProps) {
  const maxHours = data.length > 0 ? Math.max(...data.map((d) => d.hours), 0) : 0;
  /** Tallest bar = 100% of chart height so day-to-day differences are proportional to the week’s peak. */
  const scaleMax = maxHours > 0 ? maxHours : 1;

  return (
    <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h3
          className="text-sm font-semibold text-on-background"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          {title}
        </h3>
        {maxHours > 0 && (
          <span
            className="text-xs text-on-surface-variant shrink-0"
            style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
          >
            Scale: {maxHours.toFixed(1)}h max
          </span>
        )}
      </div>

      {/* Chart area — inner column must have explicit height so bar % heights resolve */}
      <div className="flex items-end gap-3 h-36">
        {data.map((day) => {
          const heightPct = maxHours > 0 ? (day.hours / scaleMax) * 100 : 0;
          const isToday = day.date === new Date().toISOString().split("T")[0];

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 h-full min-w-0">
              {/* Bar column */}
              <div className="flex flex-1 flex-col justify-end w-full min-h-0">
                <div className="relative h-full w-full min-h-0 group flex flex-col justify-end">
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div
                      className="bg-chrome text-background text-xs px-2 py-1 rounded-lg whitespace-nowrap"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {day.hours.toFixed(1)}h
                    </div>
                  </div>

                  {/* Bar — no minimum %; tallest day in range hits full column height */}
                  <div
                    className="w-full rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: day.hours > 0 && heightPct < 1 ? "2px" : undefined,
                      backgroundColor: isToday ? "var(--c-primary)" : "var(--c-primary-fixed-dim)",
                    }}
                  />
                  {/* Zero bar placeholder */}
                  {day.hours === 0 && (
                    <div className="w-full h-0.5 shrink-0 bg-surface-container rounded-full" />
                  )}
                </div>
              </div>

              {/* Labels */}
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{
                    fontFamily: "var(--font-newsreader, 'Newsreader'), serif",
                    fontStyle: "italic",
                    color: day.hours > 0 ? "var(--c-on-background)" : "var(--c-outline-variant)",
                  }}
                >
                  {day.hours > 0 ? `${day.hours.toFixed(1)}` : "—"}
                </span>
                <span
                  className="text-[10px] font-medium uppercase"
                  style={{
                    fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif",
                    color: isToday ? "var(--c-primary)" : "var(--c-outline-variant)",
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {day.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

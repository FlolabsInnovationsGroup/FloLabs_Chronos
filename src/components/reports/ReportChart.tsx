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
  const maxHours = Math.max(...data.map((d) => d.hours), 1);

  return (
    <div className="bg-white rounded-xl paper-shadow p-6">
      <h3
        className="text-sm font-semibold text-[#31332f] mb-5"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        {title}
      </h3>

      {/* Chart area */}
      <div className="flex items-end gap-3 h-36">
        {data.map((day) => {
          const heightPct = (day.hours / maxHours) * 100;
          const isToday = day.date === new Date().toISOString().split("T")[0];

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 h-full">
              {/* Bar column */}
              <div className="flex-1 flex items-end w-full">
                <div className="relative w-full group">
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div
                      className="bg-[#31332f] text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap"
                      style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
                    >
                      {day.hours.toFixed(1)}h
                    </div>
                  </div>

                  {/* Bar */}
                  <div
                    className="w-full rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${Math.max(heightPct, day.hours > 0 ? 4 : 0)}%`,
                      minHeight: day.hours > 0 ? "4px" : "2px",
                      backgroundColor: isToday ? "#366769" : "#abdddf",
                    }}
                  />
                  {/* Zero bar placeholder */}
                  {day.hours === 0 && (
                    <div className="w-full h-0.5 bg-[#efeee9] rounded-full" />
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
                    color: day.hours > 0 ? "#31332f" : "#b2b2ad",
                  }}
                >
                  {day.hours > 0 ? `${day.hours.toFixed(1)}` : "—"}
                </span>
                <span
                  className="text-[10px] font-medium uppercase"
                  style={{
                    fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif",
                    color: isToday ? "#366769" : "#b2b2ad",
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

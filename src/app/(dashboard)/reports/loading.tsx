export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-24 bg-[#efeee9] rounded" />
          <div className="h-4 w-32 bg-[#efeee9] rounded" />
        </div>
        <div className="h-9 w-28 bg-[#efeee9] rounded-md" />
      </div>
      {/* Filters bar */}
      <div className="flex flex-wrap gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-32 bg-[#efeee9] rounded-lg" />
        ))}
      </div>
      {/* Chart */}
      <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6">
        <div className="h-5 w-48 bg-[#efeee9] rounded mb-6" />
        <div className="flex items-end gap-3 h-32">
          {[40, 70, 55, 80, 30, 65, 50].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-[#efeee9] rounded-t"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-xl paper-shadow p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#efeee9] shrink-0" />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-20 bg-[#efeee9] rounded" />
              <div className="h-7 w-16 bg-[#efeee9] rounded" />
            </div>
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
        <div className="h-12 bg-[#f5f4ef]" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 border-t border-[#efeee9] px-6 flex items-center gap-4">
            <div className="h-3.5 flex-1 bg-[#efeee9] rounded" />
            <div className="h-3.5 w-12 bg-[#efeee9] rounded" />
            <div className="h-3.5 w-16 bg-[#efeee9] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-24 bg-surface-container rounded" />
          <div className="h-4 w-32 bg-surface-container rounded" />
        </div>
        <div className="h-9 w-28 bg-surface-container rounded-md" />
      </div>
      {/* Filters bar */}
      <div className="flex flex-wrap gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-32 bg-surface-container rounded-lg" />
        ))}
      </div>
      {/* Chart */}
      <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6">
        <div className="h-5 w-48 bg-surface-container rounded mb-6" />
        <div className="flex items-end gap-3 h-32">
          {[40, 70, 55, 80, 30, 65, 50].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-surface-container rounded-t"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-xl paper-shadow p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container shrink-0" />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-20 bg-surface-container rounded" />
              <div className="h-7 w-16 bg-surface-container rounded" />
            </div>
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
        <div className="h-12 bg-surface-container-low" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 border-t border-surface-container px-6 flex items-center gap-4">
            <div className="h-3.5 flex-1 bg-surface-container rounded" />
            <div className="h-3.5 w-12 bg-surface-container rounded" />
            <div className="h-3.5 w-16 bg-surface-container rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-20 bg-surface-container rounded" />
          <div className="h-4 w-20 bg-surface-container rounded" />
        </div>
        <div className="h-9 w-36 bg-surface-container rounded-md" />
      </div>
      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl paper-shadow overflow-hidden">
        <div className="h-11 bg-surface-container-low" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-t border-surface-container">
            <div className="w-8 h-8 rounded-full bg-surface-container shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-3.5 w-32 bg-surface-container rounded" />
              <div className="h-3 w-44 bg-surface-container rounded" />
            </div>
            <div className="h-5 w-16 bg-surface-container rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

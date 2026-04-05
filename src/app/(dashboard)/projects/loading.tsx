export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-28 bg-surface-container rounded" />
          <div className="h-4 w-20 bg-surface-container rounded" />
        </div>
        <div className="h-9 w-32 bg-surface-container rounded-md" />
      </div>
      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 bg-surface-container rounded-xl" />
        ))}
      </div>
    </div>
  );
}

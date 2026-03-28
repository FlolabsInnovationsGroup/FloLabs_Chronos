export default function TimerLoading() {
  return (
    <div className="flex flex-col gap-10 max-w-6xl mx-auto animate-pulse">
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-7 flex flex-col gap-8">
          {/* Timer display skeleton */}
          <div className="bg-surface-container-lowest rounded-xl paper-shadow p-10 flex flex-col items-center gap-4">
            <div className="h-24 w-64 bg-[#efeee9] rounded-xl" />
            <div className="h-4 w-32 bg-[#efeee9] rounded" />
          </div>
          {/* Timer controls skeleton */}
          <div className="flex flex-col gap-4">
            <div className="h-12 bg-[#efeee9] rounded-xl" />
            <div className="flex gap-2">
              <div className="h-9 w-36 bg-[#efeee9] rounded-full" />
              <div className="h-9 w-24 bg-[#efeee9] rounded-full" />
            </div>
            <div className="h-11 w-40 bg-[#efeee9] rounded-md" />
          </div>
        </div>
        <div className="col-span-12 md:col-span-5">
          {/* Active timer card skeleton */}
          <div className="bg-surface-container-lowest rounded-xl paper-shadow p-6 flex flex-col gap-4">
            <div className="h-5 w-32 bg-[#efeee9] rounded" />
            <div className="h-20 bg-[#efeee9] rounded-xl" />
            <div className="h-4 w-48 bg-[#efeee9] rounded" />
          </div>
        </div>
      </div>
      {/* Recent sessions skeleton */}
      <div className="flex flex-col gap-4">
        <div className="h-5 w-36 bg-[#efeee9] rounded" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-[#efeee9] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

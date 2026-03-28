"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="w-14 h-14 rounded-2xl bg-[#fff7f6] flex items-center justify-center">
        <span className="material-symbols-outlined text-[#a73b21]" style={{ fontSize: "28px" }}>
          error
        </span>
      </div>
      <div className="text-center flex flex-col gap-2">
        <h2
          className="text-xl font-light italic text-[#31332f]"
          style={{ fontFamily: "var(--font-newsreader, 'Newsreader'), serif" }}
        >
          Something went wrong
        </h2>
        <p
          className="text-sm text-[#5e605b] max-w-sm"
          style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
        >
          An unexpected error occurred. Your data is safe — please try again.
        </p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-md bg-[#366769] text-[#e3feff] text-sm font-medium hover:bg-[#295a5d] transition-colors"
        style={{ fontFamily: "var(--font-work-sans, 'Work Sans'), sans-serif" }}
      >
        Try Again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities — pure helper functions
// ---------------------------------------------------------------------------

/** Merge class names, filtering out falsy values */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Calculate the monthly-equivalent price from a yearly total */
export function monthlyEquivalent(yearlyTotal: number): number {
  return Math.round((yearlyTotal / 12) * 100) / 100;
}

/** Format a date for display (e.g. "Jan 1, 2026") */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export type ScoreEntry = { id: string; score: number };

/** A win requires participation, a positive score, and no tie for first. */
export function uniquePositiveWinner(entries: ScoreEntry[]): string | null {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  if (sorted[0]!.score <= 0 || sorted[0]!.score === sorted[1]!.score) return null;
  return sorted[0]!.id;
}

/** Comebacks require being uniquely last, rather than merely tied at the bottom. */
export function uniqueLast(entries: ScoreEntry[]): string | null {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.score - b.score);
  if (sorted[0]!.score === sorted[1]!.score) return null;
  return sorted[0]!.id;
}

export function sameRegion(guess?: string | null, target?: string | null): boolean {
  const normalize = (value?: string | null) => value?.trim().toLocaleLowerCase() ?? '';
  const normalizedTarget = normalize(target);
  return normalizedTarget.length > 0 && normalize(guess) === normalizedTarget;
}

export function nextStreak(current: number, succeeded: boolean): number {
  return succeeded ? current + 1 : 0;
}

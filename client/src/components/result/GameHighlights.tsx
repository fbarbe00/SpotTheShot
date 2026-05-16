import { motion } from "framer-motion";
import type { ReactNode } from 'react';
import type { RoundResults } from "../../lib/types";
import { getCountryName, getCountryGender, type Language } from "../../lib/countryNames";

/**
 * GameHighlights Module
 * Pure template-based statistics display system
 * All text is fully translatable via template strings
 */

/* ─────────────────────────────────────────
   Type Exports
───────────────────────────────────────── */

export type HighlightType =
  | 'player'
  | 'country'
  | 'distance'
  | 'streak'
  | 'time'
  | 'points'
  | 'round'
  | 'count';

export type Highlight = {
  key: string;
  type: HighlightType;
  value: string;
  color?: string;
  flag?: string;
};

export type StatMoment = {
  emoji: string;
  label: string;
  template: string;
  params: Record<string, string | number>;
  highlights?: Highlight[];
  streakLen?: number;
};

/* ─────────────────────────────────────────
   MomentCard Component
───────────────────────────────────────── */

const HIGHLIGHT_CLASS: Record<HighlightType, string> = {
  player:   'font-bold',            // color comes from inline style
  country:  'font-bold text-emerald-400',
  distance: 'font-bold text-primary',
  streak:   'font-bold text-orange-500',
  time:     'font-bold text-cyan-500',
  points:   'font-bold text-yellow-500',
  round:    'font-bold text-purple-500',
  count:    'font-bold text-pink-500',
};

export function MomentCard({
  moment,
  index,
  delay = 0,
}: {
  moment: StatMoment;
  index: number;
  delay?: number;
}) {
  const renderTemplate = (): ReactNode[] => {
    const { template, params, highlights = [] } = moment;

    // Group highlights by key (one key can map to multiple highlights, e.g. two players)
    const highlightGroups = new Map<string, Highlight[]>();
    for (const h of highlights) {
      const group = highlightGroups.get(h.key) ?? [];
      group.push(h);
      highlightGroups.set(h.key, group);
    }

    const parts: ReactNode[] = [];
    let partIndex = 0;

    for (const segment of template.split(/(\{\w+\})/g)) {
      if (!segment) continue;

      const match = segment.match(/^\{(\w+)\}$/);

      if (!match) {
        parts.push(segment);
        continue;
      }

      const key = match[1]!;
      const group = highlightGroups.get(key);

      if (group?.length) {
        group.forEach((h, hIdx) => {
          const nodeKey = `${partIndex}-${hIdx}`;
          const className = HIGHLIGHT_CLASS[h.type];

          parts.push(
            <span
              key={nodeKey}
              className={className}
              style={h.type === 'player' && h.color ? { color: h.color } : undefined}
            >
              {h.type === 'country' && h.flag ? `${h.flag} ` : ''}
              {h.value}
            </span>
          );

          if (hIdx < group.length - 1) {
            parts.push(<span key={`sep-${nodeKey}`}> & </span>);
          }
        });
        partIndex++;
      } else {
        // No highlight for this key — fall back to plain param text
        const paramValue = params[key];
        parts.push(paramValue !== undefined ? String(paramValue) : segment);
      }
    }

    return parts;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay + index * 0.1, duration: 0.35 }}
      className="relative flex flex-col gap-1.5 md:gap-2 rounded-xl border border-primary/20 bg-surface/60 backdrop-blur-sm p-2.5 md:p-4 overflow-hidden"
    >
      <span className="absolute -right-1 -top-1 text-3xl md:text-5xl opacity-[0.07] select-none pointer-events-none leading-none">
        {moment.emoji}
      </span>
      <div className="flex items-center gap-1 text-[8px] md:text-[10px] uppercase tracking-widest text-text-darker/50 font-bold">
        <span>{moment.emoji}</span>
        <span>{moment.label}</span>
      </div>
      <p className="text-xs md:text-sm font-medium leading-snug">{renderTemplate()}</p>
    </motion.div>
  );
}

/* ─────────────────────────────────────────
   Utility Functions
───────────────────────────────────────── */

function formatKm(km: number): string {
  return `${Math.round(km)} km`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Returns the correct i18n key suffix for a count: "_one" when count === 1, else "_other". */
export function pluralKey(count: number): '_one' | '_other' {
  return count === 1 ? '_one' : '_other';
}

/**
 * Determines if plural form should be used based on number of subjects.
 * Use this for verb conjugation in languages that support it.
 */
export function isPlural(count: number): boolean {
  return count !== 1;
}

function createMoment(
  emoji: string,
  label: string,
  template: string,
  params: Record<string, string | number>,
  highlights?: Highlight[],
): StatMoment {
  return { emoji, label, template, params, highlights };
}

/**
 * Helper to create moments with proper plural template selection.
 * Use this for moments that need different verb forms for singular/plural subjects.
 */
function createMomentWithPlural(
  emoji: string,
  label: string,
  templateSingular: string,
  templatePlural: string,
  params: Record<string, string | number>,
  subjectCount: number,
  highlights?: Highlight[],
): StatMoment {
  const template = isPlural(subjectCount) ? templatePlural : templateSingular;
  return { emoji, label, template, params, highlights };
}

/* ─────────────────────────────────────────
   buildPlayerHighlights
   Shared helper for the common pattern of
   ≤2 named players or a collapsed summary.
───────────────────────────────────────── */

type PlayerLike = { nickname: string; color?: string | null };

function buildPlayerHighlights(
  players: PlayerLike[],
  extraHighlights: Highlight[] = [],
): { playersText: string; highlights: Highlight[] } {
  const playersText =
    players.length <= 2
      ? players.map(p => p.nickname).join(' & ')
      : `${players[0]!.nickname} +${players.length - 1}`;

  const playerHighlights: Highlight[] =
    players.length <= 2
      ? players.map(p => ({
          key: 'player',
          type: 'player' as const,
          value: p.nickname,
          color: p.color ?? undefined,
        }))
      : [{ key: 'player', type: 'player' as const, value: playersText, color: players[0]!.color ?? undefined }];

  return {
    playersText,
    highlights: [...playerHighlights, ...extraHighlights],
  };
}

/* ─────────────────────────────────────────
   Helper Functions for Moment Generation
───────────────────────────────────────── */

/**
 * Filters out players who got perfect scores from a list.
 * Used to avoid showing redundant moments for perfect scorers.
 */
function filterOutPerfectScorer<T extends { playerId: string }>(
  items: T[],
  perfectPlayerIds: Set<string>,
): T[] {
  return items.filter(item => !perfectPlayerIds.has(item.playerId));
}

/**
 * Determines if a moment should be shown when there's a perfect score.
 * Returns true if: no perfect score, OR there are non-perfect players in the list.
 */
function shouldShowMomentWithPerfectScore<T extends { playerId: string }>(
  hasPerfectScore: boolean,
  allItems: T[],
  perfectPlayerIds: Set<string>,
): { shouldShow: boolean; displayItems: T[] } {
  if (!hasPerfectScore) {
    return { shouldShow: true, displayItems: allItems };
  }
  
  const nonPerfectItems = filterOutPerfectScorer(allItems, perfectPlayerIds);
  return { 
    shouldShow: nonPerfectItems.length > 0, 
    displayItems: nonPerfectItems 
  };
}

/* ─────────────────────────────────────────
   pickRoundMoments
   Generates stat moments for a single round
───────────────────────────────────────── */

export function pickRoundMoments(
  round: RoundResults,
  allPriorRounds: RoundResults[] = [],
  t: (key: string, vars?: Record<string, string | number>) => string = (key: string) => key,
  language: Language = 'en',
): StatMoment[] {
  const all = round.results;
  if (all.length === 0) return [];

  const pool: StatMoment[] = [];
  const byDist = [...all].sort((a, b) => a.distanceKm - b.distanceKm);
  const translatedCountry = getCountryName(round.photo.countryCode, language, round.photo.country);

  // ── Perfect score ──
  const perfect = all.filter(r => r.points === 5000);
  const hasPerfectScore = perfect.length > 0;

  if (hasPerfectScore) {
    const { playersText, highlights } = buildPlayerHighlights(perfect, [
      { key: 'points', type: 'points', value: '5 000 pts' },
    ]);
    pool.push(createMomentWithPlural(
      '💎',
      t('highlights.perfectScore'),
      t('highlights.perfectScoreTemplate_one'),
      t('highlights.perfectScoreTemplate_other'),
      { player: playersText, points: '5 000 pts' },
      perfect.length,
      highlights,
    ));
  }

  // ── Closest guess (skip when someone was perfect to avoid duplication) ──
  if (!hasPerfectScore) {
    const closestDist = byDist[0]!.distanceKm;
    const closestOnes = all.filter(r => r.distanceKm === closestDist);
    const { playersText, highlights } = buildPlayerHighlights(closestOnes, [
      { key: 'distance', type: 'distance', value: formatKm(closestDist) },
    ]);
    pool.push(createMomentWithPlural(
      '🎯',
      t('highlights.closestGuess'),
      t('highlights.closestGuessTemplate_one'),
      t('highlights.closestGuessTemplate_other'),
      { player: playersText, distance: formatKm(closestDist) },
      closestOnes.length,
      highlights,
    ));
  }

  // ── Furthest guess ──
  if (all.length > 1) {
    const furthestDist = byDist[byDist.length - 1]!.distanceKm;
    const furthestOnes = all.filter(r => r.distanceKm === furthestDist);
    const { playersText, highlights } = buildPlayerHighlights(furthestOnes, [
      { key: 'distance', type: 'distance', value: formatKm(furthestDist) },
    ]);
    pool.push(createMomentWithPlural(
      '🌍',
      t('highlights.mostAdventurous'),
      t('highlights.mostAdventurousTemplate_one'),
      t('highlights.mostAdventurousTemplate_other'),
      { player: playersText, distance: formatKm(furthestDist) },
      furthestOnes.length,
      highlights,
    ));
  }

  if (round.photo.country) {
    // ── Country correct ──
    const correct = all.filter(r => r.country === round.photo.country);
    if (correct.length > 0) {
      const perfectPlayerIds = new Set(perfect.map(p => p.playerId));
      const { shouldShow, displayItems } = shouldShowMomentWithPerfectScore(
        hasPerfectScore,
        correct,
        perfectPlayerIds,
      );

      if (shouldShow) {
        const { playersText, highlights } = buildPlayerHighlights(
          displayItems,
          [{ key: 'country', type: 'country', value: translatedCountry, flag: round.photo.countryFlag }],
        );
        const countryGender = getCountryGender(round.photo.countryCode, language);
        // Only pass gender to t() for template selection; country stays as {country} placeholder
        // so renderTemplate can highlight it
        pool.push(createMomentWithPlural(
          '🌐',
          t('highlights.correctCountry'),
          t('highlights.correctCountryTemplate_one', { gender: countryGender as string }),
          t('highlights.correctCountryTemplate_other', { gender: countryGender as string }),
          { player: playersText, country: translatedCountry },
          displayItems.length,
          highlights,
        ));
      }
    }

    // ── Everyone guessed the same wrong country ──
    // Bug fix: previous code used a `hiveMind` variable whose truthy condition was identical
    // to the outer check, making this branch unreachable. Rewritten with a clear intent guard.
    const uniqueGuessedCountries = [...new Set(all.map(r => r.country).filter(Boolean))];
    const everyoneGuessedSameWrongCountry =
      all.length >= 2 &&
      uniqueGuessedCountries.length === 1 &&
      uniqueGuessedCountries[0] !== round.photo.country;

    if (everyoneGuessedSameWrongCountry) {
      const wrongCountryName = uniqueGuessedCountries[0]!;
      const wrongGuess = all.find(r => r.country === wrongCountryName);
      const wrongTranslated = getCountryName(wrongGuess?.countryCode, language, wrongCountryName);

      pool.push(createMoment(
        '😅',
        t('highlights.wrongCountry'),
        t('highlights.wrongCountryTemplate'),
        { wrongCountry: wrongTranslated, correctCountry: translatedCountry },
        [
          { key: 'wrongCountry', type: 'country', value: wrongTranslated, flag: wrongGuess?.countryFlag },
          { key: 'correctCountry', type: 'country', value: translatedCountry, flag: round.photo.countryFlag },
        ],
      ));
    }

    // ── Region expert ──
    if (round.photo.region) {
      const correctRegion = all.filter(r => r.region === round.photo.region);
      if (correctRegion.length > 0) {
        const perfectPlayerIds = new Set(perfect.map(p => p.playerId));
        const { shouldShow, displayItems } = shouldShowMomentWithPerfectScore(
          hasPerfectScore,
          correctRegion,
          perfectPlayerIds,
        );

        if (shouldShow) {
          const { playersText, highlights } = buildPlayerHighlights(displayItems, [
            { key: 'region', type: 'country', value: round.photo.region },
          ]);
          pool.push(createMomentWithPlural(
            '🎯',
            t('highlights.regionExpert'),
            t('highlights.regionExpertTemplate_one'),
            t('highlights.regionExpertTemplate_other'),
            { player: playersText, region: round.photo.region },
            displayItems.length,
            highlights,
          ));
        }
      }

      // ── Global confusion ──
      const uniqueCountries = [...new Set(all.map(r => r.country).filter(Boolean))];
      const correctCount = all.filter(r => r.country === round.photo.country).length;
      if (uniqueCountries.length >= 3 && all.length >= 4 && correctCount <= Math.floor(all.length / 3)) {
        pool.push(createMoment(
          '🌍',
          t('highlights.globalConfusion'),
          t('highlights.globalConfusionTemplate'),
          { count: uniqueCountries.length, country: translatedCountry },
          [{ key: 'country', type: 'country', value: translatedCountry, flag: round.photo.countryFlag }],
        ));
      }
    }
  }

  // ── Wide spread ──
  if (byDist.length >= 2) {
    const spread = byDist[byDist.length - 1]!.distanceKm - byDist[0]!.distanceKm;
    if (spread >= 5000) {
      pool.push(createMoment(
        '🌏',
        t('highlights.spreadWide'),
        t('highlights.spreadWideTemplate'),
        { distance: formatKm(spread) },
        [{ key: 'distance', type: 'distance', value: formatKm(spread) }],
      ));
    }
  }

  // ── Streaks (consecutive correct-country guesses) ──
  if (allPriorRounds.length > 0) {
    const allRoundsWithCurrent = [...allPriorRounds, round];
    const allPlayerIds = new Set(allRoundsWithCurrent.flatMap(r => r.results.map(res => res.playerId)));

    const streakingPlayers: Array<{ nickname: string; color?: string; count: number }> = [];

    for (const playerId of allPlayerIds) {
      let streak = 0;
      for (const r of allRoundsWithCurrent) {
        const result = r.results.find(res => res.playerId === playerId);
        streak = result?.country === r.photo.country ? streak + 1 : 0;
      }
      if (streak >= 3) {
        const info = round.results.find(r => r.playerId === playerId);
        streakingPlayers.push({ count: streak, nickname: info?.nickname ?? playerId, color: info?.color ?? undefined });
      }
    }

    if (streakingPlayers.length > 0) {
      const maxStreak = Math.max(...streakingPlayers.map(p => p.count));
      const { playersText, highlights } = buildPlayerHighlights(streakingPlayers, [
        { key: 'count', type: 'streak', value: String(maxStreak) },
      ]);
      // Use pluralKey for streak count, but also handle player count for verb conjugation
      const streakKey = `highlights.onFireTemplate${pluralKey(maxStreak)}`;
      pool.push(createMomentWithPlural(
        '🔥',
        t('highlights.onFire'),
        t(streakKey),
        t(streakKey), // Same template for both, pluralKey already handles streak count
        { player: playersText, count: maxStreak },
        streakingPlayers.length,
        highlights,
      ));
    }
  }

  const PRIORITY = [
    t('highlights.onFire'),
    t('highlights.perfectScore'),
    t('highlights.closestGuess'),
    t('highlights.correctCountry'),
    t('highlights.regionExpert'),
    t('highlights.wrongCountry'),
    t('highlights.mostAdventurous'),
    t('highlights.globalConfusion'),
    t('highlights.spreadWide'),
  ];

  // Shuffle within priority tiers for variety, then slice to limit
  return [...pool]
    .sort((a, b) => {
      const ai = PRIORITY.indexOf(a.label);
      const bi = PRIORITY.indexOf(b.label);
      const pa = ai === -1 ? 99 : ai;
      const pb = bi === -1 ? 99 : bi;
      if (pa !== pb) return pa - pb;
      // Same priority tier — random shuffle for variety
      return Math.random() - 0.5;
    })
    .slice(0, 2);
}

/* ─────────────────────────────────────────
   pickGameMoments
   Generates stat moments for the entire game
───────────────────────────────────────── */

export function pickGameMoments(
  allRounds: RoundResults[],
  t: (key: string, vars?: Record<string, string | number>) => string = (key: string) => key,
  language: Language = 'en',
): StatMoment[] {
  if (allRounds.length === 0) return [];

  // Deduplicate rounds by photo id + round index
  const uniqueRounds = Array.from(
    new Map(allRounds.map(r => [`${r.photo.id}:${r.roundIndex}`, r])).values(),
  );

  const all = uniqueRounds.flatMap(r => r.results.map(g => ({ ...g, roundIndex: r.roundIndex })));
  if (all.length === 0) return [];

  const humans = all.filter(g => !g.isAI);
  const moments: StatMoment[] = [];
  const byDist = [...all].sort((a, b) => a.distanceKm - b.distanceKm);

  // ── Best guess overall ──
  const championDist = byDist[0]!.distanceKm;
  const champions = all.filter(r => r.distanceKm === championDist);
  const { playersText: champText, highlights: champHighlights } = buildPlayerHighlights(champions, [
    { key: 'distance', type: 'distance', value: formatKm(championDist) },
  ]);
  moments.push(createMomentWithPlural(
    '🎯',
    t('highlights.bestGuessOverall'),
    t('highlights.bestGuessOverallTemplate_one'),
    t('highlights.bestGuessOverallTemplate_other'),
    { player: champText, distance: formatKm(championDist) },
    champions.length,
    champHighlights,
  ));

  // ── Most lost ──
  const adventurerDist = byDist[byDist.length - 1]!.distanceKm;
  const adventurers = all.filter(r => r.distanceKm === adventurerDist);
  const { playersText: advText, highlights: advHighlights } = buildPlayerHighlights(adventurers, [
    { key: 'distance', type: 'distance', value: formatKm(adventurerDist) },
  ]);
  moments.push(createMomentWithPlural(
    '🌍',
    t('highlights.mostLost'),
    t('highlights.mostLostTemplate_one'),
    t('highlights.mostLostTemplate_other'),
    { player: advText, distance: formatKm(adventurerDist) },
    adventurers.length,
    advHighlights,
  ));

  // ── Average distance (human players only) ──
  if (humans.length > 0) {
    const avg = humans.reduce((s, g) => s + g.distanceKm, 0) / humans.length;
    const distValue = formatKm(avg);
    // Bug fix: previously passed interpolation object as second arg to t(), which the
    // (key: string) => string signature doesn't support. Template key is just the key;
    // the distance value is rendered via the highlights/params pipeline.
    moments.push(createMoment(
      '📊',
      t('highlights.averageDistance'),
      t('highlights.averageDistanceTemplate'),
      { distance: distValue },
      [{ key: 'distance', type: 'distance', value: distValue }],
    ));
  }

  // ── Most guessed country ──
  const countryCounts: Record<string, { count: number; flag?: string; countryCode?: string }> = {};
  for (const round of uniqueRounds) {
    const seenInRound = new Set<string>();
    for (const guess of round.results) {
      if (!guess.country) continue;
      const key = `${guess.playerId}:${guess.country}`;
      if (seenInRound.has(key)) continue;
      seenInRound.add(key);
      countryCounts[guess.country] ??= { count: 0, flag: guess.countryFlag ?? undefined, countryCode: guess.countryCode };
      countryCounts[guess.country]!.count++;
    }
  }
  const topCountryEntry = Object.entries(countryCounts).sort((a, b) => b[1].count - a[1].count)[0];
  if (topCountryEntry) {
    const [country, data] = topCountryEntry;
    const translatedCountry = getCountryName(data.countryCode, language, country);
    const countryGender = getCountryGender(data.countryCode, language);
    // Only pass gender/count to t() for template selection; country stays as {country} placeholder
    moments.push(createMoment(
      '📍',
      t('highlights.mostGuessedCountry'),
      t('highlights.mostGuessedCountryTemplate', { count: data.count, gender: countryGender as string }),
      { country: translatedCountry, count: data.count },
      [{ key: 'country', type: 'country', value: translatedCountry, flag: data.flag }],
    ));
  }

  // ── Perfect scores ──
  const perfectCount = all.filter(g => g.points === 5000).length;
  if (perfectCount > 0) {
    moments.push(createMoment(
      '💎',
      t('highlights.perfectScores'),
      t(`highlights.perfectScoresTemplate${pluralKey(perfectCount)}`),
      { count: perfectCount },
      [{ key: 'count', type: 'points', value: String(perfectCount) }],
    ));
  }

  // ── Per-player stats (use uniqueRounds for consistency) ──
  // Bug fix: previously Speed Demon / Overthinker used raw `allRounds` (with possible
  // duplicates), which would skew time averages. Now consolidated into one pass over
  // uniqueRounds alongside distance stats.
  const byPlayer: Record<string, { nickname: string; color?: string; dists: number[]; times: number[] }> = {};
  for (const r of uniqueRounds) {
    for (const g of r.results.filter(g => !g.isAI)) {
      byPlayer[g.playerId] ??= { nickname: g.nickname, color: g.color, dists: [], times: [] };
      byPlayer[g.playerId]!.dists.push(g.distanceKm);
      if (g.timeTakenMs != null) byPlayer[g.playerId]!.times.push(g.timeTakenMs);
    }
  }

  const playerStats = Object.values(byPlayer)
    .filter(p => p.dists.length > 0)
    .map(p => ({
      ...p,
      avgDist: p.dists.reduce((s, d) => s + d, 0) / p.dists.length,
      avgTime: p.times.length > 0 ? p.times.reduce((s, t) => s + t, 0) / p.times.length : null,
    }));

  // ── Sharpshooter (best average distance) ──
  const sharpshooter = [...playerStats].sort((a, b) => a.avgDist - b.avgDist)[0];
  if (sharpshooter) {
    moments.push(createMomentWithPlural(
      '🎯',
      t('highlights.sharpshooter'),
      t('highlights.sharpshooterTemplate_one'),
      t('highlights.sharpshooterTemplate_other'),
      { player: sharpshooter.nickname, distance: formatKm(sharpshooter.avgDist) },
      1, // Always a single player
      [
        { key: 'player', type: 'player', value: sharpshooter.nickname, color: sharpshooter.color },
        { key: 'distance', type: 'distance', value: formatKm(sharpshooter.avgDist) },
      ],
    ));
  }

  // ── Hardest photo (round with worst average distance) ──
  const hardest = [...uniqueRounds]
    .map(r => ({
      roundIndex: r.roundIndex,
      avg: r.results.reduce((s, g) => s + g.distanceKm, 0) / r.results.length,
    }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (hardest) {
    moments.push(createMoment(
      '🧩',
      t('highlights.hardestPhoto'),
      t('highlights.hardestPhotoTemplate'),
      { round: hardest.roundIndex + 1, distance: formatKm(hardest.avg) },
      [
        { key: 'round', type: 'round', value: String(hardest.roundIndex + 1) },
        { key: 'distance', type: 'distance', value: formatKm(hardest.avg) },
      ],
    ));
  }

  // ── Speed Demon & Overthinker ──
  const timedPlayers = playerStats.filter(p => p.avgTime !== null);

  if (timedPlayers.length > 0) {
    const speedDemon = [...timedPlayers].sort((a, b) => a.avgTime! - b.avgTime!)[0]!;
    moments.push(createMomentWithPlural(
      '⚡',
      t('highlights.speedDemon'),
      t('highlights.speedDemonTemplate_one'),
      t('highlights.speedDemonTemplate_other'),
      { player: speedDemon.nickname, time: formatSeconds(speedDemon.avgTime!) },
      1, // Always a single player
      [
        { key: 'player', type: 'player', value: speedDemon.nickname, color: speedDemon.color },
        { key: 'time', type: 'time', value: formatSeconds(speedDemon.avgTime!) },
      ],
    ));

    // Bug fix: only add Overthinker if they are a different player than Speed Demon,
    // to avoid redundant moments in single-player games.
    const overthinker = [...timedPlayers].sort((a, b) => b.avgTime! - a.avgTime!)[0]!;
    if (overthinker.nickname !== speedDemon.nickname) {
      moments.push(createMomentWithPlural(
        '🤔',
        t('highlights.overthinker'),
        t('highlights.overthinkerTemplate_one'),
        t('highlights.overthinkerTemplate_other'),
        { player: overthinker.nickname, time: formatSeconds(overthinker.avgTime!) },
        1, // Always a single player
        [
          { key: 'player', type: 'player', value: overthinker.nickname, color: overthinker.color },
          { key: 'time', type: 'time', value: formatSeconds(overthinker.avgTime!) },
        ],
      ));
    }
  }

  const PRIORITY = [
    t('highlights.sharpshooter'),
    t('highlights.speedDemon'),
    t('highlights.bestGuessOverall'),
    t('highlights.perfectScores'),
    t('highlights.mostGuessedCountry'),
    t('highlights.averageDistance'),
    t('highlights.hardestPhoto'),
    t('highlights.mostLost'),
    t('highlights.overthinker'),
  ];

  return [...moments]
    .sort((a, b) => {
      const ai = PRIORITY.indexOf(a.label);
      const bi = PRIORITY.indexOf(b.label);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 4);
}

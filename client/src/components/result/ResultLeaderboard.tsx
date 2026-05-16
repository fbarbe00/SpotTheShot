import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, ArrowDown, Info } from "lucide-react";
import type { LeaderboardItem, IndividualLeaderboardItem, TeamLeaderboardItem, Player } from "../../lib/types";
import { getOrdinal } from "../../lib/utils";
import { AnimatedCounter } from "./ResultRound";
import { useI18n } from "../../contexts/I18nContext";
import { getCountryName } from "../../lib/countryNames";

/**
 * ResultLeaderboard Module
 * Components for displaying game leaderboards (individual and team modes)
 */

/* ─────────────────────────────────────────
   Type Guards
───────────────────────────────────────── */

function isIndividualLeaderboardItem(item: LeaderboardItem): item is IndividualLeaderboardItem {
  return 'id' in item;
}

function isTeamLeaderboardItem(item: LeaderboardItem): item is TeamLeaderboardItem {
  return 'team' in item;
}

/* ─────────────────────────────────────────
   Leaderboard Component
───────────────────────────────────────── */

export interface LeaderboardProps {
  leaderboard: LeaderboardItem[];
  rankChanges: Record<string, { oldRank: number; newRank: number; change: number }>;
  initialRankById?: Record<string, number>;
}

export function ResultLeaderboard({
  leaderboard,
  rankChanges,
  initialRankById = {},
}: LeaderboardProps) {
  const { t, language } = useI18n();
  const getPreviousScore = (item: LeaderboardItem, _index: number): number => {
    const isTeamMode = "team" in item;
    let roundPoints = 0;
    if (isTeamMode && isTeamLeaderboardItem(item)) {
      // This is a simplified version - full implementation would need round results
      roundPoints = 0;
    }
    const prev = item.score - roundPoints;
    return prev >= 0 ? prev : 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="rounded-xl p-4 bg-surface border border-primary/20 overflow-y-auto"
    >
      <h3 className="font-extrabold mb-4 text-xl tracking-wide text-primary sticky top-0 bg-surface">
        {t("results.leaderboard")}
      </h3>

      {leaderboard.map((item, i) => {
        const itemId = isIndividualLeaderboardItem(item) ? item.id : item.team;
        const rankChange = rankChanges[itemId];
        const isTeamMode = isTeamLeaderboardItem(item);
        const isMovingUp = rankChange && rankChange.change > 0;
        const isMovingDown = rankChange && rankChange.change < 0;

        const baseMotion = {
          layout: true,
          layoutId: `leaderboard-${itemId}`,
          initial: {
            opacity: 0,
            x: -20,
            y: initialRankById[itemId] != null ? (initialRankById[itemId] - i) * 72 : 0,
          },
          animate: { opacity: 1, x: 0, y: 0, scale: isMovingUp ? [1, 1.08, 1] : isMovingDown ? [1, 0.97, 1] : 1 },
          transition: {
            delay: 0.5 + i * 0.1,
            y: { type: "spring", stiffness: 80, damping: 16 },
            scale: { duration: 0.9 },
            layout: { duration: 1.4, ease: "easeInOut" },
          },
        };

        const ringClass = isMovingUp ? "ring-2 ring-green-500/40 bg-green-900/30"
          : isMovingDown ? "ring-2 ring-orange-500/40 bg-orange-900/30" : "";
        const rankArrow = rankChange ? (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 1 + i * 0.1, ease: "backOut" }}
            className={isMovingUp ? "text-green-400" : "text-orange-400"}
          >
            {isMovingUp ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
          </motion.div>
        ) : null;

        if (isTeamMode) {
          return (
            <motion.div
              key={item.team}
              {...baseMotion}
              className={`mb-4 p-3 rounded-lg border border-primary/10 relative overflow-hidden
                ${i === 0 ? "bg-primary/15" : "bg-black/30"} ${ringClass}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 text-right font-black text-primary/80 text-sm">{getOrdinal(i + 1)}</div>
                <div className="font-extrabold text-lg tracking-wide">{item.team}</div>
                {rankArrow}
                <div className="ml-auto font-mono font-black text-xl text-primary border-2 border-primary/30 bg-primary/10 px-3 py-1 rounded-lg">
                  <AnimatedCounter value={item.score} previousValue={getPreviousScore(item, i)} delay={1 + i * 0.1} />
                </div>
              </div>
              <div className="ml-6 space-y-1">
                {"players" in item && item.players.map((p: Player) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm text-primary/80">
                    <span className="text-lg">{p.icon}</span>
                    <span className="font-medium">{p.nickname}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        }

        return (
          <motion.div
            key={item.id}
            {...baseMotion}
            className={`flex items-center gap-4 p-3 rounded-lg mb-3 relative hover:bg-white/5
              ${i === 0 ? "bg-primary/15" : "bg-black/30"} ${ringClass}`}
          >
            <div className="w-12 text-right font-black text-primary/80 text-sm">{getOrdinal(i + 1)}</div>
            <div className="text-xl">{item.icon}</div>
            <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
            <div className="flex-1 font-extrabold tracking-wide">{item.nickname}</div>
            {item.countryFlag && (
              <span className="text-sm" title={getCountryName(item.countryCode, language, item.country)}>{item.countryFlag}</span>
            )}
            {rankArrow}
            <div className="font-mono font-black text-xl text-primary border-2 border-primary/30 bg-primary/10 px-3 py-1 rounded-lg">
              <AnimatedCounter value={item.score} previousValue={getPreviousScore(item, i)} delay={1 + i * 0.1} />
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ─────────────────────────────────────────
   Scoring Info Component
───────────────────────────────────────── */

export function ScoringInfo({
  isOpen,
  onToggle,
  uploaderPenaltyPercent = 40,
  gameMode = "individual",
}: {
  isOpen: boolean;
  onToggle: () => void;
  uploaderPenaltyPercent?: number;
  gameMode?: "individual" | "teams";
}) {
  const { t } = useI18n();
  const isTeamMode = gameMode === "teams";
  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onClick={onToggle}
        className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 text-text-darker hover:text-primary transition-colors flex items-center justify-between border border-primary/10 flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <Info size={18} />
          <span className="text-sm font-medium">{t("results.howScoringWorks")}</span>
        </div>
        <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </motion.button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 text-sm bg-white/5 rounded-lg p-4 border border-primary/10"
          >
            <div>
              <h3 className="font-bold text-primary mb-1">{t("results.scoreFormula")}</h3>
              <p className="text-text-darker text-xs break-words">
                {isTeamMode ? t("results.scoreFormulaDescTeam") : t("results.scoreFormulaDesc")}
              </p>
            </div>
            <div>
              <h3 className="font-bold text-primary mb-1">{t("results.uploaderPenalty")}</h3>
              <p className="text-text-darker text-xs break-words">
                {t(isTeamMode ? "results.uploaderPenaltyDescTeam" : "results.uploaderPenaltyDesc", {
                  penalty: uploaderPenaltyPercent,
                  points: Math.round(1000 * (1 - (uploaderPenaltyPercent || 40) / 100)),
                })}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

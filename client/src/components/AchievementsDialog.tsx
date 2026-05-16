import { useState } from 'react';
import { Trophy, X, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Achievement } from '../lib/achievementTypes';
import { ALL_ACHIEVEMENTS } from '../lib/achievementsData';
import { useI18n } from '../contexts/I18nContext';
import { getAchievementLocalized } from '../lib/achievementI18n';

export function AchievementsDialog({
  earnedAchievements,
  nextAchievements,
  onClose,
  onResetAll
}: {
  earnedAchievements: Achievement[];
  nextAchievements: Achievement[];
  onClose: () => void;
  onResetAll: () => void;
}) {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<'earned' | 'next'>('earned');
  const totalAchievements = ALL_ACHIEVEMENTS.length;
  const completionPercentage = totalAchievements > 0
    ? Math.round((earnedAchievements.length / totalAchievements) * 100)
    : 0;

  const categories: Record<string, { label: string; icon: string; description: string }> = {
    'getting-started': { label: t('ach.category.gettingStarted.label'), icon: '🎮', description: t('ach.category.gettingStarted.desc') },
    'accuracy':        { label: t('ach.category.accuracy.label'),       icon: '🎯', description: t('ach.category.accuracy.desc') },
    'momentum':        { label: t('ach.category.momentum.label'),       icon: '⚡', description: t('ach.category.momentum.desc') },
    'mastery':         { label: t('ach.category.mastery.label'),        icon: '👑', description: t('ach.category.mastery.desc') },
    'explorer':        { label: t('ach.category.explorer.label'),       icon: '🌍', description: t('ach.category.explorer.desc') },
    'ai-master':       { label: t('ach.category.aiMaster.label'),       icon: '🤖', description: t('ach.category.aiMaster.desc') },
    'creator':         { label: t('ach.category.creator.label'),        icon: '📸', description: t('ach.category.creator.desc') },
    'fun':             { label: t('ach.category.fun.label'),            icon: '🎉', description: t('ach.category.fun.desc') },
    'grand':           { label: t('ach.category.grand.label'),          icon: '🏆', description: t('ach.category.grand.desc') },
  };

  const categoryOrder = ['getting-started', 'accuracy', 'momentum', 'mastery', 'explorer', 'ai-master', 'creator', 'fun', 'grand'];

  const groupByCategory = (achs: Achievement[]) => {
    const grouped: Record<string, Achievement[]> = {};
    achs.forEach(ach => {
      const cat = ach.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ach);
    });
    const sorted: Record<string, Achievement[]> = {};
    categoryOrder.forEach(key => { if (grouped[key]) sorted[key] = grouped[key]; });
    return sorted;
  };

  const earnedByCategory = groupByCategory(earnedAchievements);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-primary/20"
      >
        {/* Header */}
        <div className="bg-black/30 border-b border-primary/20 p-5 sm:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Trophy className="text-primary flex-shrink-0" size={28} />
              <h2 className="text-xl sm:text-2xl font-bold text-primary">{t('ach.dialog.title')}</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-primary/10 rounded-lg transition-colors text-text-darker hover:text-primary flex-shrink-0">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-text-darker">
              <span>{t('ach.dialog.complete', { percent: completionPercentage })}</span>
              <span className="font-mono font-bold text-primary">{earnedAchievements.length}/{totalAchievements}</span>
            </div>
            <div className="w-full bg-background rounded-full h-2.5 overflow-hidden border border-primary/20">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 0.6 }}
                className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-primary/20 bg-black/20 px-4 sm:px-6">
          <button
            onClick={() => setActiveTab('earned')}
            className={`py-3 px-4 text-sm font-medium transition-all border-b-2 ${activeTab === 'earned' ? 'border-primary text-primary' : 'border-transparent text-text-darker hover:text-primary'}`}
          >
            <span className="flex items-center gap-2">
              <Trophy size={15} />
              {t('ach.dialog.earned', { count: earnedAchievements.length })}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('next')}
            className={`py-3 px-4 text-sm font-medium transition-all border-b-2 ${activeTab === 'next' ? 'border-primary text-primary' : 'border-transparent text-text-darker hover:text-primary'}`}
          >
            <span className="flex items-center gap-2">
              <Lock size={15} />
              {t('ach.dialog.nextChallenges')}
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {activeTab === 'earned' ? (
            Object.entries(earnedByCategory).length > 0 ? (
              <div className="space-y-5">
                {Object.entries(earnedByCategory).map(([categoryKey, achs]) => {
                  const catData = categories[categoryKey];
                  if (!catData) return null;
                  const totalInCat = ALL_ACHIEVEMENTS.filter(a => a.category === categoryKey).length;

                  return (
                    <motion.div
                      key={categoryKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-black/20 rounded-xl border border-primary/10 overflow-hidden"
                    >
                      {/* Category header */}
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/10 bg-black/20">
                        <span className="text-xl">{catData.icon}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-primary text-sm">{catData.label}</h3>
                          <p className="text-[10px] text-text-darker truncate">{catData.description}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-primary/70 flex-shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">
                          {achs.length}/{totalInCat}
                        </span>
                      </div>

                      {/* Achievement cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-primary/5">
                        {achs.map((ach, idx) => {
                          const localized = getAchievementLocalized(ach.id, language, ach.name, ach.description);
                          return (
                            <motion.div
                              key={ach.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: idx * 0.04 }}
                              className="flex items-start gap-3 p-3 bg-black/30 hover:bg-black/50 transition-colors"
                            >
                              <span className="text-3xl flex-shrink-0 leading-none mt-0.5">{ach.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-primary leading-tight">{localized.name}</p>
                                <p className="text-xs text-text-darker mt-0.5 leading-snug">{localized.description}</p>
                                {ach.target && (
                                  <div className="mt-1.5 flex items-center gap-2">
                                    <div className="flex-1 bg-background rounded-full h-1 overflow-hidden border border-primary/20">
                                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(((ach.progress || 0) / ach.target) * 100, 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] text-text-darker font-mono flex-shrink-0">{ach.progress || 0}/{ach.target}</span>
                                  </div>
                                )}
                                {ach.unlockedAt && (
                                  <p className="text-[10px] text-text-darker/50 mt-1">
                                    {new Date(ach.unlockedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { if (window.confirm(t('ach.dialog.resetConfirm'))) onResetAll(); }}
                    className="px-2 py-1 text-[10px] rounded-md border border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    {t('ach.dialog.resetButton')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy size={48} className="text-primary/30 mx-auto mb-4" />
                <p className="text-text font-medium">{t('ach.dialog.noneYetTitle')}</p>
                <p className="text-sm text-text-darker">{t('ach.dialog.noneYetDesc')}</p>
              </div>
            )
          ) : (
            nextAchievements.length > 0 ? (
              <div className="space-y-3">
                {nextAchievements.map((ach, idx) => {
                  const localized = getAchievementLocalized(ach.id, language, ach.name, ach.description);
                  return (
                    <motion.div
                      key={ach.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      className="flex items-start gap-3 p-3 rounded-xl border border-primary/10 bg-black/20 hover:bg-black/30 transition-colors"
                    >
                      {/* Greyed-out emoji instead of a lock icon */}
                      <span className="text-3xl flex-shrink-0 leading-none mt-0.5 opacity-30 grayscale">{ach.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-text leading-tight">{localized.name}</p>
                        <p className="text-xs text-text-darker/60 mt-0.5 leading-snug line-clamp-2">{localized.description}</p>
                        {ach.target && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-primary/20">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full"
                                style={{ width: `${Math.min(((ach.progress || 0) / ach.target) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-text-darker font-mono flex-shrink-0">{ach.progress || 0}/{ach.target}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
                <p className="text-xs text-text-darker text-center mt-4 pt-4 border-t border-primary/10">
                  {t('ach.dialog.keepPlaying')}
                </p>
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy size={48} className="text-primary/30 mx-auto mb-4" />
                <p className="text-text font-medium">{t('ach.dialog.allEarnedTitle')}</p>
                <p className="text-sm text-text-darker">{t('ach.dialog.allEarnedDesc')}</p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-primary/20 bg-black/30">
          <button onClick={onClose} className="w-full bg-primary hover:bg-primary-dark text-background font-bold py-2 px-4 rounded-lg transition-all">
            {t('common.close')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

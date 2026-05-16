import { useState, useEffect } from 'react';
import { Trophy, Sparkles as SparklesIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { Achievement } from '../lib/achievementTypes';
import { Confetti, Sparkles } from './Confetti';
import { useI18n } from '../contexts/I18nContext';
import { getAchievementLocalized } from '../lib/achievementI18n';

type NotificationType = 'single' | 'batch';

export function AchievementNotification({
  achievements,
  onClose,
  type = 'batch'
}: {
  achievements: Achievement[];
  onClose: () => void;
  type?: NotificationType;
}) {
  const { t, language } = useI18n();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (type === 'single' && achievements.length === 1) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [type, achievements.length, onClose]);

  if (!isVisible || achievements.length === 0) return null;

  const isSingle = achievements.length === 1;
  const achievement = isSingle ? achievements[0] : null;
  const localizedSingle = achievement
    ? getAchievementLocalized(achievement.id, language, achievement.name, achievement.description)
    : null;

  const categoryLabel = (category: string) => {
    const keyByCategory: Record<string, string> = {
      'getting-started': 'ach.category.gettingStarted.label',
      accuracy: 'ach.category.accuracy.label',
      momentum: 'ach.category.momentum.label',
      mastery: 'ach.category.mastery.label',
      explorer: 'ach.category.explorer.label',
      'ai-master': 'ach.category.aiMaster.label',
      creator: 'ach.category.creator.label',
      fun: 'ach.category.fun.label',
      grand: 'ach.category.grand.label',
    };
    return t(keyByCategory[category] || '', undefined, category.replace(/-/g, ' '));
  };

  const dismiss = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (isSingle && achievement) {
    return createPortal(
      <AnimatePresence>
        {isVisible && (
          <>
            <Confetti count={40} duration={3} />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="fixed bottom-6 right-4 sm:bottom-8 sm:right-8 z-[10020] max-w-sm w-[calc(100vw-2rem)] sm:w-auto"
            >
              <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 rounded-2xl p-5 shadow-2xl border-2 border-amber-300/50 overflow-hidden relative">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-bl from-white/20 rounded-full blur-3xl" />
                </div>
                <Sparkles count={15} duration={2} />

                {/* Dismiss button */}
                <button
                  onClick={dismiss}
                  className="absolute top-2 right-2 p-1 rounded-full bg-black/20 hover:bg-black/40 transition-colors text-white/70 hover:text-white z-10"
                >
                  <X size={14} />
                </button>

                <div className="relative z-10 flex items-start gap-4 pr-4">
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div className="absolute inset-0 bg-white/20 rounded-full blur-lg" />
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                        className="relative w-12 h-12 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center"
                      >
                        <Trophy className="w-7 h-7 text-white" fill="white" />
                      </motion.div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <SparklesIcon className="w-3 h-3 text-amber-200 flex-shrink-0" />
                      <p className="text-[10px] font-bold text-amber-100 uppercase tracking-wide">{t('ach.notification.unlocked')}</p>
                    </div>
                    <h3 className="text-lg font-bold text-white leading-tight">
                      {achievement.emoji} {localizedSingle?.name}
                    </h3>
                    <p className="text-amber-50 text-xs mt-1 leading-snug">
                      {localizedSingle?.description}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  // Batch modal
  return createPortal(
    <>
      <Confetti count={60} duration={3.5} />
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[10020] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-amber-500/20 overflow-hidden max-h-[85vh] flex flex-col"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 pointer-events-none" />

          {/* Header */}
          <div className="relative z-10 flex items-center gap-3 p-5 pb-4 border-b border-slate-700/50 flex-shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg flex-shrink-0">
              <Trophy className="w-5 h-5 text-white" fill="white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-300 uppercase tracking-wide">🎉 {t('ach.notification.gameComplete')}</p>
              <h2 className="text-lg font-bold text-white leading-tight">
                {t('ach.notification.unlockedCount', { count: achievements.length })}
              </h2>
            </div>
            <button onClick={dismiss} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-slate-400 hover:text-white flex-shrink-0">
              <X size={18} />
            </button>
          </div>

          {/* Achievements list */}
          <div className="relative z-10 overflow-y-auto flex-1 p-4 space-y-2">
            {achievements.map((ach, idx) => {
              const localized = getAchievementLocalized(ach.id, language, ach.name, ach.description);
              return (
                <motion.div
                  key={ach.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-3 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg p-3 border border-slate-600/30 transition-colors"
                >
                  <span className="text-2xl flex-shrink-0">{ach.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm leading-tight">{localized.name}</p>
                    <p className="text-xs text-slate-300 mt-0.5 leading-tight line-clamp-1">{localized.description}</p>
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-600/50 text-slate-300 uppercase tracking-wide flex-shrink-0 hidden sm:block">
                    {categoryLabel(ach.category)}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="relative z-10 p-4 pt-3 border-t border-slate-700/50 flex-shrink-0">
            <button
              onClick={dismiss}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold py-2.5 rounded-xl transition-all shadow-lg"
            >
              {t('ach.notification.continue')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>,
    document.body
  );
}

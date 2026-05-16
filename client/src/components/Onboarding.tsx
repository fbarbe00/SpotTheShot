import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, MapPin, Users, Trophy } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { LanguageSelector } from './LanguageSelector';
import { logger } from '../lib/logger';

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [showModal, setShowModal] = useState(true);

  const steps = [
    {
      title: t('onboarding.step1.title'),
      description: t('onboarding.step1.desc'),
      image: "🌍",
      highlight: t('onboarding.step1.highlight'),
      visual: t('onboarding.step1.visual'),
    },
    {
      title: t('onboarding.step2.title'),
      description: t('onboarding.step2.desc'),
      image: "📸",
      highlight: t('onboarding.step2.highlight'),
      visual: t('onboarding.step2.visual'),
    },
    {
      title: t('onboarding.step3.title'),
      description: t('onboarding.step3.desc'),
      image: "🎯",
      highlight: t('onboarding.step3.highlight'),
      visual: t('onboarding.step3.visual'),
    },
    {
      title: t('onboarding.step4.title'),
      description: t('onboarding.step4.desc'),
      image: "🏆",
      highlight: t('onboarding.step4.highlight'),
      visual: t('onboarding.step4.visual'),
    },
    {
      title: t('onboarding.step5.title'),
      description: t('onboarding.step5.desc'),
      image: "🤖",
      highlight: t('onboarding.step5.highlight'),
      visual: t('onboarding.step5.visual'),
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      setShowModal(false);
      setTimeout(onComplete, 300);
    }
  };

  const handlePrevious = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSkip = () => {
    setShowModal(false);
    setTimeout(onComplete, 300);
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div
        className="bg-surface rounded-2xl border border-primary/20 w-full max-w-2xl mx-auto overflow-visible"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        {/* Header */}
        <div className="p-4 border-b border-primary/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">🎮 {t('onboarding.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button
              onClick={handleSkip}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title={t('onboarding.skip')}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px] flex flex-col">
          <div className="flex-1 flex flex-col items-center text-center">
            {/* Step indicator */}
            <div className="flex gap-2 mb-6">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${index === step ? 'bg-primary' : 'bg-white/20'}`}
                />
              ))}
            </div>

            {/* Emoji */}
            <div className="text-6xl mb-4">
              {steps[step]?.image}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold mb-2">
              {steps[step]?.title}
            </h2>

            {/* Description */}
            <p className="text-text-darker mb-4 max-w-md">
              {steps[step]?.description}
            </p>

            {/* Highlight */}
            <div className="bg-primary/10 text-primary px-4 py-2 rounded-lg inline-block text-sm font-medium">
              {steps[step]?.highlight}
            </div>
          </div>

          {/* Visual guide */}
          <div className="mt-6 rounded-xl p-4 border border-primary/20 bg-gradient-to-br from-primary/15 to-blue-500/10">
            <AnimatePresence mode="wait">
              <motion.div
                key={`visual-${step}`}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex items-center gap-3 p-4 rounded-lg bg-black/20 border border-white/10 min-h-[72px]"
              >
                <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center text-primary">
                  {step === 1 && <ImageIcon size={18} />}
                  {step === 2 && <MapPin size={18} />}
                  {step === 3 && <Trophy size={18} />}
                  {(step === 0 || step === 4) && <Users size={18} />}
                </div>
                <p className="text-sm text-text-darker text-left">{steps[step]?.visual}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-primary/10 flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={step === 0}
            className={`px-4 py-2 rounded-lg transition-colors ${step === 0 ? 'bg-white/5 text-text-darker cursor-not-allowed' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {t('onboarding.previous')}
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors"
          >
            {step < steps.length - 1 ? (
              <>{t('onboarding.next')}</>
            ) : (
              <>{t('onboarding.getStarted')}</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Helper hook for onboarding state
export function useOnboarding() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    // Check if onboarding was already completed
    try {
      const completed = localStorage.getItem('onboardingCompleted');
      if (completed) {
        setHasCompletedOnboarding(true);
      }
    } catch (error) {
      logger.warn('Could not check onboarding status', error);
    }
  }, []);

  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
    try {
      localStorage.setItem('onboardingCompleted', 'true');
    } catch (error) {
      logger.error('Could not save onboarding completion', error);
    }
  };

  const resetOnboarding = () => {
    setHasCompletedOnboarding(false);
    try {
      localStorage.removeItem('onboardingCompleted');
    } catch (error) {
      logger.error('Could not reset onboarding status', error);
    }
  };

  return { hasCompletedOnboarding, completeOnboarding, resetOnboarding };
}

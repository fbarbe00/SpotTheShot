import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, HelpCircle, Lock } from 'lucide-react';
import type { Photo } from '../lib/types';
import { buildPhotoUrl } from '../lib/socket';
import { useI18n } from '../contexts/I18nContext';

export default function DateSubmodeGuess({ photo, lobbyId, playerId, mode, disabled, existingChoice, existingOrder, onConfirm }: {
  photo: Photo;
  lobbyId: string;
  playerId: string;
  mode: 'before_after' | 'timeline';
  disabled: boolean;
  existingChoice?: 'before' | 'after';
  existingOrder?: string[];
  onConfirm: (guess: { dateChoice: 'before' | 'after' } | { photoOrder: string[] }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [order, setOrder] = useState(() => existingOrder || photo.timelinePhotos?.map(item => item.id) || []);
  const [dateChoice, setDateChoice] = useState<'before' | 'after' | undefined>(existingChoice);
  const [submitting, setSubmitting] = useState(false);
  // Re-sync only when the challenge itself changes (different photo or a
  // different set of card ids). Lobby updates rebuild the photo object with a
  // fresh array identity but identical ids; resetting on identity would
  // discard an in-progress arrangement on every unrelated broadcast.
  const timelineIds = photo.timelinePhotos?.map(item => item.id).join('|') ?? '';
  useEffect(() => {
    setOrder(existingOrder || (timelineIds ? timelineIds.split('|') : []));
  }, [photo.id, timelineIds, existingOrder]);
  useEffect(() => setSubmitting(false), [photo.id]);
  useEffect(() => setDateChoice(existingChoice), [photo.id, existingChoice]);

  const submit = async (guess: { dateChoice: 'before' | 'after' } | { photoOrder: string[] }) => {
    if (disabled || submitting) return;
    setSubmitting(true);
    const accepted = await onConfirm(guess);
    if (!accepted) setSubmitting(false);
  };

  if (mode === 'before_after' && photo.dateReference) {
    const mystery = {
      id: photo.id,
      url: photo.url,
      label: t('game.date.photoToPlace'),
      icon: <HelpCircle size={13} className="shrink-0" />,
      mystery: true,
    };
    const reference = {
      id: photo.dateReference.id,
      url: photo.dateReference.url,
      label: t('game.date.reference'),
      icon: <CalendarDays size={13} className="shrink-0 text-text-darker" />,
      mystery: false,
    };
    const cards = dateChoice === 'after' ? [reference, mystery] : [mystery, reference];
    return <div className="absolute inset-0 z-[1003] flex flex-col bg-surface p-2 pt-16">
      <div className="mb-2 text-center text-sm font-black text-white sm:text-base">{t('game.date.beforeAfterPrompt')}</div>
      <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-2 sm:gap-4">
        {cards.map(card => <div key={card.id} className={`grid min-w-0 grid-rows-[2.25rem_minmax(0,1fr)] gap-1 overflow-hidden rounded-xl border-2 bg-black/30 p-1.5 sm:p-2 ${card.mystery ? 'border-primary/70 shadow-[0_0_14px_rgba(0,246,255,0.18)]' : 'border-dashed border-white/35'}`}>
          <div className={`flex items-center justify-center gap-1 rounded-lg px-1 text-center text-[10px] font-black uppercase tracking-wide sm:text-xs ${card.mystery ? 'bg-primary text-black' : 'bg-white/15 text-text'}`}>{card.icon}{card.label}</div>
          <img src={buildPhotoUrl(card.url, lobbyId, playerId)} alt="" className="h-full min-h-0 w-full rounded-lg bg-black object-contain" />
        </div>)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" aria-label={t('game.date.moveEarlier')} disabled={disabled || submitting} onClick={() => setDateChoice('before')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border p-2 text-sm font-black transition-transform active:scale-[0.98] disabled:opacity-50 ${dateChoice === 'before' ? 'border-primary bg-primary text-black' : 'border-primary/40 bg-primary/10 text-primary'}`}><ArrowLeft size={18} className="shrink-0" />{t('game.date.before')}</button>
        <button type="button" aria-label={t('game.date.moveLater')} disabled={disabled || submitting} onClick={() => setDateChoice('after')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border p-2 text-sm font-black transition-transform active:scale-[0.98] disabled:opacity-50 ${dateChoice === 'after' ? 'border-primary bg-primary text-black' : 'border-primary/40 bg-primary/10 text-primary'}`}>{t('game.date.after')}<ArrowRight size={18} className="shrink-0" /></button>
      </div>
      <button type="button" disabled={disabled || submitting || !dateChoice} onClick={() => dateChoice && void submit({ dateChoice })} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 font-black text-black disabled:opacity-40"><Lock size={18} />{t('game.lockGuess')}</button>
    </div>;
  }

  if (mode !== 'timeline' || !photo.timelinePhotos || photo.timelinePhotos.length !== 3) {
    return <div className="absolute inset-0 z-[1003] flex items-center justify-center bg-surface p-6 text-center font-bold text-red-300">
      {t('game.date.challengeUnavailable')}
    </div>;
  }

  const photos = order.map(id => photo.timelinePhotos?.find(item => item.id === id)).filter((item): item is { id: string; url: string } => !!item);
  const move = (index: number, offset: number) => setOrder(current => {
    const next = [...current];
    const target = index + offset;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  });
  const positionLabels = ['game.date.timelineOldest', 'game.date.timelineMiddle', 'game.date.timelineNewest'];
  return <div className="absolute inset-0 z-[1003] flex flex-col bg-surface p-2 pt-16">
    <div className="mb-2 text-center text-sm font-black text-white sm:text-base">{t('game.date.timelinePrompt')}</div>
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5 sm:gap-3">{photos.map((item, index) => <div key={item.id} className="grid min-w-0 grid-rows-[2rem_minmax(0,1fr)_2.5rem] overflow-hidden rounded-xl border border-white/10 bg-black/30 p-1 sm:p-2">
      <div className="flex items-center justify-center rounded bg-primary/15 px-1 text-center text-[9px] font-black uppercase tracking-wide text-primary sm:text-xs">{t(positionLabels[index]!)}</div>
      <img src={buildPhotoUrl(item.url, lobbyId, playerId)} alt="" className="h-full min-h-0 w-full rounded-lg bg-black object-contain" />
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <button type="button" disabled={disabled || submitting || index === 0} onClick={() => move(index, -1)} aria-label={t('game.date.moveEarlier')} className="flex items-center justify-center rounded bg-white/10 text-primary disabled:opacity-20"><ChevronLeft size={20} /></button>
        <button type="button" disabled={disabled || submitting || index === photos.length - 1} onClick={() => move(index, 1)} aria-label={t('game.date.moveLater')} className="flex items-center justify-center rounded bg-white/10 text-primary disabled:opacity-20"><ChevronRight size={20} /></button>
      </div>
    </div>)}</div>
    <button type="button" disabled={disabled || submitting || order.length !== 3} onClick={() => void submit({ photoOrder: order })} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 font-black text-black disabled:opacity-50"><Check size={18} />{t('common.confirm')}</button>
  </div>;
}

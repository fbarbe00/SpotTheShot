import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
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

  const submit = async (guess: { dateChoice: 'before' | 'after' } | { photoOrder: string[] }) => {
    if (disabled || submitting) return;
    setSubmitting(true);
    const accepted = await onConfirm(guess);
    if (!accepted) setSubmitting(false);
  };

  if (mode === 'before_after' && photo.dateReference) {
    return <div className="absolute inset-0 z-[1003] flex flex-col bg-surface p-2 pt-16">
      <div className="mb-2 text-center text-sm font-black text-white sm:text-base">{t('game.date.beforeAfterPrompt')}</div>
      <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-2 sm:gap-4">
        <div className="grid min-w-0 grid-rows-[2.25rem_minmax(0,1fr)] gap-1 overflow-hidden rounded-xl border-2 border-primary/70 bg-black/30 p-1.5 shadow-[0_0_14px_rgba(0,246,255,0.18)] sm:p-2">
          <div className="flex items-center justify-center gap-1 rounded-lg bg-primary px-1 text-center text-[10px] font-black uppercase tracking-wide text-black sm:text-xs"><HelpCircle size={13} className="shrink-0" />{t('game.date.photoToPlace')}</div>
          <img src={buildPhotoUrl(photo.url, lobbyId, playerId)} alt="" className="h-full min-h-0 w-full rounded-lg bg-black object-contain" />
        </div>
        <div className="grid min-w-0 grid-rows-[2.25rem_minmax(0,1fr)] gap-1 overflow-hidden rounded-xl border-2 border-dashed border-white/35 bg-black/30 p-1.5 sm:p-2">
          <div className="flex items-center justify-center gap-1 rounded-lg bg-white/15 px-1 text-center text-[10px] font-black uppercase tracking-wide text-text sm:text-xs"><CalendarDays size={13} className="shrink-0 text-text-darker" />{t('game.date.reference')}</div>
          <img src={buildPhotoUrl(photo.dateReference.url, lobbyId, playerId)} alt="" className="h-full min-h-0 w-full rounded-lg bg-black object-contain" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/50 bg-surface text-primary shadow-lg">
          <ArrowLeftRight size={17} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || submitting} onClick={() => void submit({ dateChoice: 'before' })} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary p-3 text-sm font-black text-black transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${existingChoice === 'before' ? 'ring-2 ring-white' : ''}`}><ArrowLeft size={18} className="shrink-0" />{t('game.date.beforeChoice')}</button>
        <button type="button" disabled={disabled || submitting} onClick={() => void submit({ dateChoice: 'after' })} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary p-3 text-sm font-black text-black transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${existingChoice === 'after' ? 'ring-2 ring-white' : ''}`}><ArrowRight size={18} className="shrink-0" />{t('game.date.afterChoice')}</button>
      </div>
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

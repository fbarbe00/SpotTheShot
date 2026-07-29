import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Lobby, RoundResults } from '../lib/types'
import { buildPhotoUrl, socket } from '../lib/socket'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../lib/toast'
import ModeResultLeaderboard from './result/ModeResultLeaderboard'

export default function UploaderResult({ data, lobby, playerId }: {
  data: RoundResults
  lobby: Lobby
  playerId: string
}) {
  const { t } = useI18n()
  const { addToast } = useToast()
  const isHost = lobby.hostId === playerId
  const isLastRound = data.roundIndex === data.totalRounds - 1
  const uploader = lobby.players.find(player => player.id === data.photo.uploaderId)
  const next = () => socket.emit('next_round', { lobbyId: lobby.id, playerId }, (response: { success?: boolean; error?: string }) => {
    if (!response?.success) addToast(response?.error || t('toast.connectionHiccup'), 'error', 5000)
  })

  return (
    <div className="mx-auto grid max-h-[calc(100svh-80px)] max-w-6xl gap-5 overflow-y-auto px-2 md:grid-cols-[1.1fr_0.9fr]">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
        className="overflow-hidden rounded-2xl border border-primary/20 bg-surface">
        <img src={buildPhotoUrl(data.photo.url, lobby.id, playerId)} alt="" className="h-64 w-full bg-black object-contain md:h-[28rem]" />
        <div className="bg-gradient-to-r from-sky-500/10 via-primary/10 to-violet-500/10 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary/70">{t('game.uploader.uploadedBy')}</div>
          <div className="mt-2 flex items-center justify-center gap-3 text-3xl font-black text-white">
            <span>{uploader?.icon || '👤'}</span>
            <span>{uploader?.nickname || t('game.uploader.unknown')}</span>
          </div>
        </div>
      </motion.div>
      <div className="flex flex-col gap-3">
        {isHost ? (
          <button onClick={next} className="flex items-center justify-center gap-2 rounded-xl bg-primary p-3 font-black text-black hover:bg-primary-dark">
            {isLastRound ? t('game.viewResults') : t('game.nextRound')} <ChevronRight size={18} />
          </button>
        ) : (
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-center text-sm text-text-darker">
            {t('results.waitingNextRound')}
          </div>
        )}
        <ModeResultLeaderboard
          data={data}
          lobby={lobby}
          playerId={playerId}
          renderAnswer={result => {
            const guessed = lobby.players.find(player => player.id === result.guessedUploaderId)
            return (
              <span className={`flex flex-wrap items-center gap-1.5 ${result.correctUploader ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.correctUploader ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span>{t('game.uploader.votedFor')}</span>
                <span>{guessed?.icon || '👤'} {guessed?.nickname || t('game.uploader.unknown')}</span>
              </span>
            )
          }}
        />
      </div>
    </div>
  )
}

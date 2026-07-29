import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CalendarDays, Check, ChevronDown, Crown, DoorOpen, HelpCircle, Key, MapPin, Users, X } from 'lucide-react'
import { useI18n } from '../../contexts/I18nContext'
import { api, clearStoredToken, getStoredToken, setStoredToken } from '../../lib/socket'
import { useToast } from '../../lib/toast'
import { normalizeString } from '../../lib/utils'
import { DEFAULT_ROUND_DURATION_SEC, type LobbyProps } from './types'
import { gameModeDefinition, isDateModeNew, isGameType, isUploaderModeNew } from '../../lib/gameModes'
import type { GameType } from '../../lib/gameModes'

function GameTypePicker({ value, onChange }: {
  value: GameType
  onChange: (gameType: GameType) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const options: Array<{
    value: GameType
    description: string
    icon: typeof MapPin
    isNew: boolean
  }> = [
    { value: 'spot', description: t('settings.spotTypeDesc'), icon: MapPin, isNew: false },
    { value: 'date', description: t('settings.dateTypeDesc'), icon: CalendarDays, isNew: isDateModeNew() },
    { value: 'uploader', description: t('settings.uploaderTypeDesc'), icon: Users, isNew: isUploaderModeNew() },
  ]
  const selected = options.find(option => option.value === value) ?? options[0]!

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  const moveSelection = (direction: 1 | -1) => {
    const index = options.findIndex(option => option.value === value)
    const next = options[(index + direction + options.length) % options.length]!
    onChange(next.value)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(event.key === 'ArrowDown' ? 1 : -1)
      setOpen(true)
    }
  }

  const SelectedIcon = selected.icon
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        onKeyDown={handleKeyDown}
        className="flex w-full items-center gap-2 rounded-xl border border-primary/25 bg-background/80 px-3 py-2.5 text-left shadow-sm transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <SelectedIcon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-black text-text">
            {gameModeDefinition(selected.value).name}
          </span>
          <span className="block truncate text-[10px] text-text-darker">{selected.description}</span>
        </span>
        {selected.isNew && (
          <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-black">
            {t('common.new')}
          </span>
        )}
        <ChevronDown size={15} className={`flex-shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          aria-label={t('lobby.chooseGameType')}
          onKeyDown={handleKeyDown}
          className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-xl border border-primary/25 bg-surface/98 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          {options.map(option => {
            const Icon = option.icon
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                  active ? 'bg-primary/18 text-text' : 'text-text-darker hover:bg-white/7 hover:text-text'
                }`}
              >
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${active ? 'bg-primary/20 text-primary' : 'bg-white/5'}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">
                    {gameModeDefinition(option.value).name}
                  </span>
                  <span className="block truncate text-[10px] leading-tight text-text-darker">{option.description}</span>
                </span>
                {option.isNew && (
                  <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-black">
                    {t('common.new')}
                  </span>
                )}
                {active && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function JoinOrCreateView({
  nickname,
  joinLobbyId,
  isJoining = false,
  onSetNickname,
  onCreateLobby,
  onPreviewGameType,
  onJoinLobby,
  onViewTutorial,
}: LobbyProps & { onViewTutorial?: () => void }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [lobbyIdInput, setLobbyIdInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState(getStoredToken() || '');
  const [tokenSaved, setTokenSaved] = useState(!!getStoredToken());
  const [gameType, setGameType] = useState<GameType>('spot');
  const [invitedGameType, setInvitedGameType] = useState<GameType | null>(null);

  // Sync lobby ID input with joinLobbyId prop (for clearing on failure)
  useEffect(() => {
    setLobbyIdInput(joinLobbyId || '');
  }, [joinLobbyId]);

  useEffect(() => {
    let cancelled = false
    if (!joinLobbyId) {
      setInvitedGameType(null)
      onPreviewGameType?.('spot')
      return
    }
    api.getLobbyPublic(joinLobbyId)
      .then(preview => {
        if (cancelled || !isGameType(preview?.gameType)) return
        setInvitedGameType(preview.gameType)
        onPreviewGameType?.(preview.gameType)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [joinLobbyId, onPreviewGameType])

  const canSubmit = nickname.trim().length >= 2;
  const isJoiningViaLink = !!joinLobbyId && lobbyIdInput === joinLobbyId;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (isJoiningViaLink || lobbyIdInput.trim().length > 0) {
      onJoinLobby({ nickname, lobbyId: lobbyIdInput });
    } else {
      onCreateLobby({ nickname, roundDuration: DEFAULT_ROUND_DURATION_SEC, gameType });
    }
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">{t('lobby.welcomeTitle')}</h2>

          <p className="text-sm text-text-darker mb-6 px-2">
            {t((isJoiningViaLink ? invitedGameType : gameType) === 'date'
                ? 'lobby.welcomeDescDate'
                : (isJoiningViaLink ? invitedGameType : gameType) === 'uploader'
                  ? 'lobby.welcomeDescUploader'
                  : 'lobby.welcomeDescSpot')}
          </p>

          <p className="text-text-darker mb-2">
            {isJoiningViaLink
              ? t('lobby.enterNicknameJoin')
              : t('lobby.enterNicknameBegin')}
          </p>

          <form onSubmit={handleSubmit}>
            <input
              className="w-full rounded-lg bg-white/5 border border-primary/20 p-3 text-center text-lg font-bold tracking-wider"
              placeholder={t('lobby.yourNickname')}
              value={nickname}
              onChange={e => onSetNickname(e.target.value)}
              maxLength={20}
              autoFocus
            />

            {isJoiningViaLink ? (
              // Join via link flow
              canSubmit && (
                <div className="mt-6 bg-white/5 rounded-xl p-4 border border-primary/10">
                  <p className="text-sm text-text-darker mb-4">
                    {t('lobby.joiningLobby')}{' '}
                    <span className="font-mono font-bold text-primary">
                      {lobbyIdInput}
                    </span>
                  </p>

                  <button
                    type="submit"
                    disabled={isJoining}
                    className="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <DoorOpen size={20} /> {isJoining ? t('lobby.joining') : t('lobby.joinLobby')}
                  </button>
                </div>
              )
            ) : (
              // Normal create/join flow
              canSubmit && (
                <div className="mt-6 text-left">
                  <div className="grid sm:grid-cols-2 gap-4">
                  {/* Create Lobby */}
                  <div className="bg-white/5 rounded-xl p-4 border border-primary/10 flex flex-col">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-3">
                      <Crown size={20} /> {t('lobby.createLobby')}
                    </h3>
                    <p className="text-sm text-text-darker mb-4">
                      {t('lobby.createLobbyDesc')}
                    </p>
                    <div className="mb-4">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-text-darker">
                        {t('lobby.chooseGameType')}
                      </span>
                      <GameTypePicker
                        value={gameType}
                        onChange={selected => {
                          setGameType(selected)
                          onPreviewGameType?.(selected)
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isJoining}
                      className="w-full mt-auto px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isJoining ? t('lobby.creating') : t('lobby.createAndJoin')}
                    </button>
                  </div>

                  {/* Join Lobby */}
                  <div className="bg-white/5 rounded-xl p-4 border border-primary/10 flex flex-col">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-3">
                      <DoorOpen size={20} /> {t('lobby.joinLobbyTitle')}
                    </h3>

                    <input
                      className="w-full rounded-lg bg-surface border border-primary/20 p-3 text-center font-mono tracking-widest"
                      placeholder={t('lobby.lobbyIdPlaceholder')}
                      value={normalizeString(lobbyIdInput).toUpperCase()}
                      onChange={e => setLobbyIdInput(normalizeString(e.target.value).toUpperCase().slice(0, 12))}
                      onKeyDown={e => {
                        const normalizedId = normalizeString(lobbyIdInput).toUpperCase();
                        if (e.key === 'Enter' && normalizedId.length >= 3 && normalizedId.length <= 12) {
                          onJoinLobby({ nickname, lobbyId: normalizedId })
                        }
                      }}
                      maxLength={12}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        const normalizedId = normalizeString(lobbyIdInput).toUpperCase();
                        onJoinLobby({ nickname, lobbyId: normalizedId })
                      }}
                      disabled={isJoining || normalizeString(lobbyIdInput).length < 3 || normalizeString(lobbyIdInput).length > 12}
                      className="w-full mt-auto px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isJoining ? t('lobby.joining') : t('lobby.join')}
                    </button>
                  </div>
                  </div>
                </div>
              )
            )}
          </form>
        </div>

        {/* Access token */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowTokenInput(v => !v)}
            className="flex items-center gap-1.5 text-xs text-text-darker/50 hover:text-text-darker/80 transition-colors mx-auto"
          >
            <Key size={11} />
            {tokenSaved ? t('lobby.tokenActive') : t('lobby.haveToken')}
            {tokenSaved && <Check size={11} className="text-green-400" />}
          </button>
          {showTokenInput && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={tokenInput}
                onChange={e => { setTokenInput(e.target.value); setTokenSaved(false); }}
                placeholder={t('lobby.tokenPlaceholder')}
                className="flex-1 rounded-lg bg-white/5 border border-primary/20 p-2 text-xs font-mono"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!tokenInput.trim()) {
                    clearStoredToken();
                    setTokenSaved(false);
                    addToast(t('lobby.tokenCleared'), 'info', 2000);
                    return;
                  }
                  const res = await api.validateToken(tokenInput.trim());
                  if (res.valid) {
                    setStoredToken(tokenInput.trim());
                    setTokenSaved(true);
                    addToast(t('lobby.tokenSaved', { name: res.name || tokenInput.slice(0, 8) + '…' }), 'success', 3000);
                  } else {
                    addToast(t('lobby.tokenInvalid'), 'error', 3000);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold text-xs"
              >
                {t('common.save')}
              </button>
              {tokenSaved && (
                <button
                  type="button"
                  onClick={() => { clearStoredToken(); setTokenInput(''); setTokenSaved(false); addToast(t('lobby.tokenCleared'), 'info', 2000); }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer with tutorial link */}
        {onViewTutorial && (
          <div className="mt-6 flex items-center justify-center gap-3 py-1">
            <button
              onClick={onViewTutorial}
              className="flex items-center gap-1 text-xs text-text-darker hover:text-primary"
            >
              <HelpCircle size={14} />
              {t('onboarding.viewTutorial')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

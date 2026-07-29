import type { GameSettings, Lobby, LobbyConstraints } from '../../lib/types'

export const DEFAULT_ROUND_DURATION_SEC = 45
export const DEFAULT_HINT_THRESHOLD_SEC = 25

// Generous fallback used client-side before lobby data arrives.
export const OPEN_CONSTRAINTS: LobbyConstraints = {
  maxPlayersPerLobby: 20,
  maxPhotosPerPlayer: 10,
  allowAllMaps: true,
  allowAIGuessing: true,
  allowAutoNaming: true,
  allowVisionCommentary: true,
}

export type LobbyProps = {
  lobby: Lobby | null
  playerId: string
  nickname: string
  joinLobbyId?: string
  isJoining?: boolean
  onSetNickname: (name: string) => void
  onCreateLobby: (params: { nickname: string; roundDuration: number }) => void
  onJoinLobby: (params: { nickname: string; lobbyId: string }) => void
  onSetReady: (ready: boolean) => void
  onStartGame: () => void
  onExitLobby: () => void
  onUpdateSettings: (settings: GameSettings) => Promise<boolean>
  onKickPlayer: (playerIdToKick: string) => void
  onSetTeam?: (playerId: string, team: string) => void
  onOpenVersionLog?: () => void
  hasUnseenVersionLog?: boolean
  currentVersion?: string
}

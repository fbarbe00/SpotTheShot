import { useEffect, useState } from 'react'
import { socket } from '../lib/socket'
import { AlertCircle, Clock } from 'lucide-react'
import { useI18n } from '../contexts/I18nContext'

export function ConnectionStatus() {
  const { t } = useI18n()
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected')

  useEffect(() => {
    const handleConnect = () => {
      setStatus('connected')
    }

    const handleDisconnect = () => {
      setStatus('disconnected')
    }

    const handleReconnectAttempt = () => {
      setStatus('reconnecting')
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.io.on('reconnect_attempt', handleReconnectAttempt)

    // Set initial state
    setStatus(socket.connected ? 'connected' : 'disconnected')

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.io.off('reconnect_attempt', handleReconnectAttempt)
    }
  }, [])

  if (status === 'connected') {
    return null // Don't show when connected
  }

  const isReconnecting = status === 'reconnecting'
  const bgColor = isReconnecting ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-red-500/20 border-red-500/50'
  const icon = isReconnecting ? (
    <Clock size={16} className="text-yellow-400 animate-spin" />
  ) : (
    <AlertCircle size={16} className="text-red-400" />
  )
  const text = isReconnecting ? t('ui.reconnecting') : t('ui.connectionLost')

  return (
    <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg border ${bgColor} flex items-center gap-2 z-50`}>
      {icon}
      <span className="text-sm font-medium">{text}</span>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Confetti particles component
 * Displays celebratory confetti animation
 */
export function Confetti({ count = 30, duration = 3 }: { count?: number; duration?: number }) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; color: string }>>([])

  useEffect(() => {
    const colors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFF700', '#FF1493']
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100 - 50,
      delay: Math.random() * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)] || '#FFD700',
    }))
    setParticles(newParticles)
  }, [count])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{ opacity: 1, x: particle.x, y: 0, scale: 1, rotate: 0 }}
          animate={{
            opacity: 0,
            x: particle.x * (Math.random() + 0.5),
            y: window.innerHeight + 100,
            scale: 0,
            rotate: Math.random() * 720,
          }}
          transition={{
            duration: duration,
            delay: particle.delay,
            ease: 'easeIn',
          }}
          className="fixed w-2 h-2 rounded-full"
          style={{
            backgroundColor: particle.color,
            left: '50%',
            top: '50%',
          }}
        />
      ))}
    </div>
  )
}

/**
 * Sparkle particles for subtle celebration effect
 */
export function Sparkles({ count = 12, duration = 2 }: { count?: number; duration?: number }) {
  const [particles, setParticles] = useState<Array<{ id: number; angle: number; delay: number }>>([])

  useEffect(() => {
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (i / count) * Math.PI * 2,
      delay: Math.random() * 0.1,
    }))
    setParticles(newParticles)
  }, [count])

  return (
    <div className="absolute inset-0 pointer-events-none">
      {particles.map((particle) => {
        const x = Math.cos(particle.angle) * 100
        const y = Math.sin(particle.angle) * 100

        return (
          <motion.div
            key={particle.id}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{
              opacity: 0,
              x,
              y,
              scale: 0,
            }}
            transition={{
              duration,
              delay: particle.delay,
              ease: 'easeOut',
            }}
            className="absolute w-1.5 h-1.5 bg-yellow-300 rounded-full"
            style={{
              left: '50%',
              top: '50%',
              marginLeft: '-3px',
              marginTop: '-3px',
            }}
          />
        )
      })}
    </div>
  )
}

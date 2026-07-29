import { useEffect, useRef, useState } from 'react'

export function AnimatedCounter({
  value,
  previousValue = 0,
  delay = 0,
  msPerUnit = 30,
  minDuration = 300,
  maxDuration = 3000,
}: {
  value: number
  previousValue?: number
  delay?: number
  msPerUnit?: number
  minDuration?: number
  maxDuration?: number
}) {
  const [displayValue, setDisplayValue] = useState(previousValue)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const difference = value - previousValue
    const duration = Math.min(maxDuration, Math.max(minDuration, Math.abs(difference) * msPerUnit))
    let startTime: number | null = null

    const animate = (now: number) => {
      startTime ??= now
      const progress = Math.min((now - startTime) / duration, 1)
      setDisplayValue(Math.floor(previousValue + progress * difference))
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
      else setDisplayValue(value)
    }

    const timeout = window.setTimeout(() => {
      frameRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      window.clearTimeout(timeout)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, previousValue, delay, msPerUnit, minDuration, maxDuration])

  return <span>{displayValue}</span>
}

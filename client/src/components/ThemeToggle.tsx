import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { motion } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext'

/**
 * Theme toggle button component
 * Allows users to switch between light, dark, and system themes
 * Typically placed in header/navbar
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()

  const handleClick = () => {
    // Cycle through: light → dark → system → light
    switch (theme) {
      case 'light':
        setTheme('dark')
        break
      case 'dark':
        setTheme('system')
        break
      default:
        setTheme('light')
    }
  }

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
      title={t('ui.toggleTheme')}
      aria-label={t('ui.toggleTheme')}
    >
      {theme === 'light' && <Sun className="w-5 h-5 text-yellow-500" />}
      {theme === 'dark' && <Moon className="w-5 h-5 text-blue-400" />}
      {theme === 'system' && <Monitor className="w-5 h-5 text-text-darker" />}
    </motion.button>
  )
}

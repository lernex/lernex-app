'use client'

import { ReactNode, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  delay?: number
  position?: 'top' | 'bottom' | 'left' | 'right'
  shortcut?: string
  className?: string
  disabled?: boolean
}

export default function Tooltip({
  content,
  children,
  delay = 300,
  position = 'top',
  shortcut,
  className = '',
  disabled = false
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const showTooltip = () => {
    if (disabled) return

    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const scrollX = window.scrollX
        const scrollY = window.scrollY

        let x = 0
        let y = 0

        switch (position) {
          case 'top':
            x = rect.left + rect.width / 2 + scrollX
            y = rect.top + scrollY
            break
          case 'bottom':
            x = rect.left + rect.width / 2 + scrollX
            y = rect.bottom + scrollY
            break
          case 'left':
            x = rect.left + scrollX
            y = rect.top + rect.height / 2 + scrollY
            break
          case 'right':
            x = rect.right + scrollX
            y = rect.top + rect.height / 2 + scrollY
            break
        }

        setCoords({ x, y })
        setIsVisible(true)
      }
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const getPositionStyles = () => {
    switch (position) {
      case 'top':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(-50%, calc(-100% - 8px))',
          originY: 1
        }
      case 'bottom':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(-50%, 8px)',
          originY: 0
        }
      case 'left':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(calc(-100% - 8px), -50%)',
          originX: 1
        }
      case 'right':
        return {
          left: coords.x,
          top: coords.y,
          transform: 'translate(8px, -50%)',
          originX: 0
        }
    }
  }

  const positionStyles = getPositionStyles()

  const tooltipContent = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: positionStyles.left,
            top: positionStyles.top,
            transform: positionStyles.transform,
            transformOrigin: `${positionStyles.originX || 0.5} ${positionStyles.originY || 0.5}`,
            zIndex: 9999,
            pointerEvents: 'none'
          }}
          className={`
            max-w-xs px-3 py-2 text-sm rounded-lg
            bg-gray-900 dark:bg-gray-800 text-white
            shadow-lg shadow-black/20
            ${className}
          `}
        >
          <div className="flex items-center gap-2">
            <span>{content}</span>
            {shortcut && (
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-800 dark:bg-gray-700 rounded border border-gray-700 dark:border-gray-600">
                {shortcut}
              </kbd>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-block"
      >
        {children}
      </div>
      {typeof document !== 'undefined' && createPortal(tooltipContent, document.body)}
    </>
  )
}

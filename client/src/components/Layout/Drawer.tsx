import { useEffect, useRef, ReactNode } from 'react'
import './Drawer.css'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  position?: 'left' | 'right'
  width?: string
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
  width = '400px'
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      // 防止背景滚动
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      window.addEventListener('keydown', handleEsc)
    }

    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="drawer-overlay animate-fade-in">
      <div
        ref={drawerRef}
        className={`drawer drawer-${position} animate-slide-in-${position}`}
        style={{ width }}
      >
        {title && (
          <div className="drawer-header">
            <h3 className="drawer-title">{title}</h3>
            <button className="icon-btn" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="drawer-content">
          {children}
        </div>
      </div>
    </div>
  )
}
/**
 * 可调整宽度的三栏布局组件
 * 支持拖拽调整左右侧栏宽度
 */

import React, { useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import './ResizableLayout.css'

interface ResizableLayoutProps {
  leftPanel?: ReactNode
  centerPanel: ReactNode
  rightPanel?: ReactNode
  leftWidth?: number
  rightWidth?: number
  minCenterWidth?: number
  minSideWidth?: number
  onLeftToggle?: (collapsed: boolean) => void
  onRightToggle?: (collapsed: boolean) => void
}

export function ResizableLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftWidth: initialLeftWidth = 200,
  rightWidth: initialRightWidth = 360,
  minCenterWidth = 400,
  minSideWidth = 300,
  onLeftToggle,
  onRightToggle
}: ResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth)
  const [rightWidth, setRightWidth] = useState(initialRightWidth)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingLeft = useRef(false)
  const isDraggingRight = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // 切换左侧栏
  const toggleLeft = useCallback(() => {
    const newLeftCollapsed = !leftCollapsed
    setLeftCollapsed(newLeftCollapsed)
    if (!newLeftCollapsed) {
      setRightCollapsed(true) // 互斥：只显示一个
    }
    onLeftToggle?.(newLeftCollapsed)
    onRightToggle?.(true)
  }, [leftCollapsed, onLeftToggle, onRightToggle])

  // 切换右侧栏
  const toggleRight = useCallback(() => {
    const newRightCollapsed = !rightCollapsed
    setRightCollapsed(newRightCollapsed)
    if (!newRightCollapsed) {
      setLeftCollapsed(true) // 互斥：只显示一个
    }
    onRightToggle?.(newRightCollapsed)
    onLeftToggle?.(true)
  }, [rightCollapsed, onLeftToggle, onRightToggle])

  // 将 toggle 函数添加到 centerPanel
  const renderCenterPanel = () => {
    if (!centerPanel) return null
    const child = centerPanel as React.ReactElement
    if (child && child.props) {
      return React.cloneElement(child, {
        onToggleLeft: toggleLeft,
        onToggleRight: toggleRight
      } as any)
    }
    return centerPanel
  }

  // 开始拖拽左侧
  const handleDragStartLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingLeft.current = true
    startX.current = e.clientX
    startWidth.current = leftWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftWidth])

  // 开始拖拽右侧
  const handleDragStartRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRight.current = true
    startX.current = e.clientX
    startWidth.current = rightWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [rightWidth])

  // 处理拖拽
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft.current) {
        const delta = e.clientX - startX.current
        const newWidth = Math.max(minSideWidth, Math.min(startWidth.current + delta, 500))
        setLeftWidth(newWidth)
      }
      if (isDraggingRight.current) {
        const delta = e.clientX - startX.current
        const newWidth = Math.max(minSideWidth, Math.min(startWidth.current - delta, 500))
        setRightWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      isDraggingLeft.current = false
      isDraggingRight.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minSideWidth])

  return (
    <div className="resizable-layout" ref={containerRef}>
      {/* 左侧栏 */}
      {leftPanel && (
        <aside
          className={`resizable-left ${leftCollapsed ? 'collapsed' : ''}`}
          style={leftCollapsed ? {} : { width: leftWidth }}
        >
          {!leftCollapsed && leftPanel}
        </aside>
      )}

      {/* 左侧拖拽手柄 */}
      {leftPanel && !leftCollapsed && (
        <div
          className="resize-handle resize-handle-left"
          onMouseDown={handleDragStartLeft}
        />
      )}

      {/* 中间区域 */}
      <div
        className="resizable-center"
        style={{
          minWidth: minCenterWidth
        }}
      >
        {renderCenterPanel()}
      </div>

      {/* 右侧拖拽手柄 */}
      {rightPanel && !rightCollapsed && (
        <div
          className="resize-handle resize-handle-right"
          onMouseDown={handleDragStartRight}
        />
      )}

      {/* 右侧栏 */}
      {rightPanel && (
        <aside
          className={`resizable-right ${rightCollapsed ? 'collapsed' : ''}`}
          style={rightCollapsed ? {} : { width: rightWidth }}
        >
          {!rightCollapsed && rightPanel}
        </aside>
      )}
    </div>
  )
}
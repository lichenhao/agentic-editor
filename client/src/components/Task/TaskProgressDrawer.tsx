import { useState } from 'react'
import './TaskProgressDrawer.css'
import { TaskInfo } from '../../types'

// 导出 TaskInfo 以便其他模块使用
export type { TaskInfo } from '../../types'

interface TaskProgressDrawerProps {
  tasks: TaskInfo[]
  isExpanded?: boolean
  onToggle?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待执行',
  RUNNING: '执行中',
  WAITING: '等待中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消'
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#9ca3af',
  RUNNING: '#3b82f6',
  WAITING: '#f59e0b',
  COMPLETED: '#10b981',
  FAILED: '#ef4444',
  CANCELLED: '#6b7280'
}

const EXECUTION_MODE_LABELS: Record<string, string> = {
  SERIAL: '串行',
  PARALLEL: '并行',
  HYBRID: '混合'
}

export function TaskProgressDrawer({ tasks, isExpanded = false, onToggle }: TaskProgressDrawerProps) {
  const [expanded, setExpanded] = useState(isExpanded)

  const toggle = () => {
    setExpanded(!expanded)
    onToggle?.()
  }

  // 计算耗时
  const getDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt) return ''
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : Date.now()
    const seconds = Math.floor((end - start) / 1000)
    if (seconds < 60) return `${seconds}秒`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}分钟`
    const hours = Math.floor(minutes / 60)
    return `${hours}小时${minutes % 60}分钟`
  }

  // 获取执行模式显示
  const getExecutionMode = (mode?: string) => {
    return mode ? EXECUTION_MODE_LABELS[mode] || mode : ''
  }

  return (
    <div className={`task-progress-drawer ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="task-drawer-header" onClick={toggle}>
        <div className="task-drawer-title">
          <span className="task-drawer-icon">{expanded ? '▼' : '▶'}</span>
          <span>任务进度</span>
          {tasks.length > 0 && <span className="task-count">({tasks.length})</span>}
        </div>
      </div>

      {expanded && (
        <div className="task-drawer-content">
          {tasks.length === 0 ? (
            <div className="task-empty">暂无任务</div>
          ) : (
            <div className="task-list">
              {tasks.map(task => (
                <div key={task.id} className="task-item">
                  <div className="task-item-header">
                    <span className="task-name">{task.name}</span>
                    <span
                      className="task-status"
                      style={{ backgroundColor: STATUS_COLORS[task.status] }}
                    >
                      {STATUS_LABELS[task.status] || task.status}
                    </span>
                  </div>
                  <div className="task-item-meta">
                    {task.executionMode && (
                      <span className="task-mode">{getExecutionMode(task.executionMode)}</span>
                    )}
                    {task.startedAt && (
                      <span className="task-duration">{getDuration(task.startedAt, task.completedAt)}</span>
                    )}
                  </div>
                  {task.progressMessage && (
                    <div className="task-message">{task.progressMessage}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
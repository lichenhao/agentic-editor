import { useState } from 'react'
import './TaskProgressDrawer.css'

export interface TaskInfo {
  id: string
  name: string
  type: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'WAITING_APPROVAL' | 'FAILED' | 'APPROVED' | 'NEEDS_REVISION'
  assigneeType?: string
  startedAt?: string
  completedAt?: string
  progress?: number
  progressMessage?: string
}

interface TaskProgressDrawerProps {
  tasks: TaskInfo[]
  isExpanded?: boolean
  onToggle?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待执行',
  IN_PROGRESS: '执行中',
  COMPLETED: '已完成',
  WAITING_APPROVAL: '待确认',
  FAILED: '失败',
  APPROVED: '已通过',
  NEEDS_REVISION: '需修改'
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#9ca3af',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#10b981',
  WAITING_APPROVAL: '#f59e0b',
  FAILED: '#ef4444',
  APPROVED: '#10b981',
  NEEDS_REVISION: '#f97316'
}

const TYPE_LABELS: Record<string, string> = {
  DIRECTOR_WORKFLOW: '总导演工作流',
  TASK_CHUNKING: '分片处理',
  TASK_ANALYSIS: '需求分析',
  TASK_ASSET_GENERATION: '素材生成',
  TASK_STORYBOARD: '故事板',
  TASK_VIDEO_GENERATION: '视频生成',
  TASK_EDITING: '剪辑'
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

  // 获取执行人显示
  const getAssignee = (type?: string) => {
    const labels: Record<string, string> = {
      director: '总导演',
      asset: '美术',
      storyboard: '分镜',
      video: '视频',
      editing: '剪辑'
    }
    return type ? labels[type] || type : '待分配'
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
                    <span className="task-name">{task.name || TYPE_LABELS[task.type] || task.type}</span>
                    <span
                      className="task-status"
                      style={{ backgroundColor: STATUS_COLORS[task.status] }}
                    >
                      {STATUS_LABELS[task.status] || task.status}
                    </span>
                  </div>
                  <div className="task-item-meta">
                    <span className="task-assignee">{getAssignee(task.assigneeType)}</span>
                    {task.startedAt && (
                      <span className="task-duration">{getDuration(task.startedAt, task.completedAt)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
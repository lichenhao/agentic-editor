import { prisma } from '../infrastructure/database/prisma'
import { chunkingQueue, analysisQueue, assetGenerationQueue, storyboardQueue, videoGenerationQueue, editingQueue } from '../infrastructure/queue/queue'

// In-memory SSE subscribers for project progress
const projectSubscribers: Map<string, Set<(data: any) => void>> = new Map()

export const projectService = {
  async getProjects(userId: string) {
    return prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
  },

  async getProject(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        blueprint: true,
        assets: true,
        shots: true,
        tasks: true
      }
    })
  },

  async getStoryboard(projectId: string) {
    return prisma.shot.findMany({
      where: { projectId },
      orderBy: [{ sceneId: 'asc' }, { id: 'asc' }]
    })
  },

  async updateStoryboard(projectId: string, shots: any[]) {
    for (const shot of shots) {
      await prisma.shot.update({
        where: { id: shot.id },
        data: {
          shotType: shot.shotType,
          cameraMovement: shot.cameraMovement,
          description: shot.description,
          dialogue: shot.dialogue,
          assetRefs: shot.assetRefs
        }
      })
    }
  },

  async getDelivery(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project || project.status !== 'COMPLETED') {
      return null
    }

    // In production, this would return actual S3 URLs
    return {
      videoUrl: `mem://delivery/${projectId}/final.mp4`,
      format: 'mp4',
      projectName: project.name
    }
  },

  async retryTask(projectId: string, taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.projectId !== projectId) {
      throw new Error('Task not found')
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'PENDING', retries: { increment: 1 } }
    })

    // Re-add to queue based on task type
    const queue = getQueueForTaskType(task.type)
    await queue.add('retry', { taskId, projectId, payload: task.payload })
  },

  async deleteProject(id: string) {
    await prisma.project.delete({ where: { id } })
  },

  async subscribeProgress(projectId: string, callback: (data: any) => void): Promise<() => void> {
    if (!projectSubscribers.has(projectId)) {
      projectSubscribers.set(projectId, new Set())
    }
    projectSubscribers.get(projectId)!.add(callback)

    return () => {
      projectSubscribers.get(projectId)?.delete(callback)
    }
  }
}

function getQueueForTaskType(type: string) {
  switch (type) {
    case 'chunking': return chunkingQueue
    case 'analysis': return analysisQueue
    case 'asset_generation': return assetGenerationQueue
    case 'storyboard': return storyboardQueue
    case 'video_generation': return videoGenerationQueue
    case 'editing': return editingQueue
    default: return chunkingQueue
  }
}

// Export function to publish project progress
export function publishProjectProgress(projectId: string, data: any) {
  const subscribers = projectSubscribers.get(projectId)
  if (subscribers) {
    subscribers.forEach(callback => callback(data))
  }
}
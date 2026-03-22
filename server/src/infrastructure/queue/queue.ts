import { Queue } from 'bullmq'

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
}

export const QUEUES = {
  CHUNKING: 'chunking',
  ANALYSIS: 'analysis',
  ASSET_GENERATION: 'asset_generation',
  STORYBOARD: 'storyboard',
  VIDEO_GENERATION: 'video_generation',
  EDITING: 'editing'
} as const

// Create queues
export const chunkingQueue = new Queue(QUEUES.CHUNKING, { connection })
export const analysisQueue = new Queue(QUEUES.ANALYSIS, { connection })
export const assetGenerationQueue = new Queue(QUEUES.ASSET_GENERATION, { connection })
export const storyboardQueue = new Queue(QUEUES.STORYBOARD, { connection })
export const videoGenerationQueue = new Queue(QUEUES.VIDEO_GENERATION, { connection })
export const editingQueue = new Queue(QUEUES.EDITING, { connection })

// Export connection for workers
export { connection }

// Helper to get queue by name
export function getQueue(name: string) {
  switch (name) {
    case QUEUES.CHUNKING:
      return chunkingQueue
    case QUEUES.ANALYSIS:
      return analysisQueue
    case QUEUES.ASSET_GENERATION:
      return assetGenerationQueue
    case QUEUES.STORYBOARD:
      return storyboardQueue
    case QUEUES.VIDEO_GENERATION:
      return videoGenerationQueue
    case QUEUES.EDITING:
      return editingQueue
    default:
      return null
  }
}
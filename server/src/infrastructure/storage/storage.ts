import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

// Database
export const prisma = new PrismaClient()

// OpenAI Client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-demo'
})

// Simple in-memory storage for POC (replace with S3/Supabase in production)
const storage: Map<string, { data: string; contentType: string }> = new Map()

export const storageService = {
  async upload(key: string, data: string, contentType: string): Promise<string> {
    storage.set(key, { data, contentType })
    return `mem://${key}`
  },

  async download(key: string): Promise<{ data: string; contentType: string } | null> {
    if (key.startsWith('mem://')) {
      return storage.get(key.slice(6)) || null
    }
    return null
  },

  async delete(key: string): Promise<void> {
    storage.delete(key)
  }
}

// Logger
export const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, error?: any) => console.error(`[ERROR] ${msg}`, error),
  debug: (msg: string, meta?: any) => console.log(`[DEBUG] ${msg}`, meta || '')
}
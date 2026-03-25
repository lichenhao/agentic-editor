import { z } from 'zod';

// Agent entity types
export const AgentRole = z.enum(['supervisor', 'specialist', 'spec-skill']);
export type AgentRole = z.infer<typeof AgentRole>;

export const AgentStatus = z.enum(['active', 'inactive', 'recreating']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export interface AgentMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgTokenUsage: number;
  avgDurationMs: number;
  avgScore: number;
  consecutiveRejections: number;
}

export const AgentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  name: z.string(),
  role: AgentRole,
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
  status: AgentStatus.default('active'),
  version: z.number().int().default(1),
  parentAgentId: z.string().uuid().optional(),
  metrics: z.record(z.any()).default({}),
  soulMd: z.string().optional(),
  agentsMd: z.string().optional(),
  memoryMd: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Agent = z.infer<typeof AgentSchema>;

// Agent Template
export const AgentTemplateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  role: AgentRole,
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;

// User entity
export const UserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
  userMd: z.string().optional(),
  passwordHash: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type User = z.infer<typeof UserSchema>;

// Task entity
export const TaskStatus = z.enum(['pending', 'running', 'waiting_approval', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const SubTaskSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  status: TaskStatus.default('pending'),
  name: z.string(),
  input: z.string().optional(),
  output: z.string().optional(),
  dependencies: z.array(z.string().uuid()).default([]),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});

export type SubTask = z.infer<typeof SubTaskSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  parentTaskId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
  status: TaskStatus.default('pending'),
  input: z.string(),
  output: z.string().optional(),
  decomposedSubtasks: z.array(SubTaskSchema).default([]),
  threadId: z.string().uuid().optional(),
  contextTree: z.record(z.any()).default({}),
  createdAt: z.date().default(() => new Date()),
  completedAt: z.date().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// Skill entity
export const SkillSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  promptTemplate: z.string(),
  tools: z.array(z.string()).default([]),
  createdBy: z.string().uuid().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Skill = z.infer<typeof SkillSchema>;

// Policy entity
export const PolicyType = z.enum(['permission', 'approval', 'security', 'iteration']);
export type PolicyType = z.infer<typeof PolicyType>;

export const PolicySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  type: PolicyType,
  condition: z.record(z.any()),
  action: z.record(z.any()),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  version: z.number().int().default(1),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Policy = z.infer<typeof PolicySchema>;

// Thread entity (context)
export const ThreadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().optional(),
  context: z.array(z.record(z.any())).default([]),
  contextTokens: z.number().int().default(0),
  branchRootId: z.string().uuid().optional(),
  parentBranchId: z.string().uuid().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type Thread = z.infer<typeof ThreadSchema>;

// Assessment entity
export const AssessmentResult = z.enum(['recreate', 'exempt', 'approve']);
export type AssessmentResult = z.infer<typeof AssessmentResult>;

export const AssessmentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  agentId: z.string().uuid(),
  tokenUsed: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  feedbackScore: z.number().int().min(1).max(5).optional(),
  feedbackText: z.string().optional(),
  calculatedScore: z.number().optional(),
  assessmentResult: AssessmentResult.optional(),
  reasons: z.array(z.string()).default([]),
  createdAt: z.date().default(() => new Date()),
});

export type Assessment = z.infer<typeof AssessmentSchema>;

// Approval entity
export const ApprovalAction = z.enum(['approve', 'reject', 'exempt']);
export type ApprovalAction = z.infer<typeof ApprovalAction>;

export const ApprovalSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  subtaskId: z.string().uuid().optional(),
  action: ApprovalAction,
  approverId: z.string().uuid().optional(),
  comment: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
});

export type Approval = z.infer<typeof ApprovalSchema>;

// Tool call entity
export const ToolCallSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  subtaskId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  toolName: z.string(),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  status: z.enum(['success', 'error']).default('success'),
  error: z.string().optional(),
  tokenUsed: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  createdAt: z.date().default(() => new Date()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

// Context message for thread
export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// User profile (USER.md parsed)
export interface UserProfile {
  role: string;
  techStack: string[];
  replyHabit: string;
  language: string;
  timeoutThreshold: number;
  autoExecutableActions: string[];
  requireConfirmationActions: string[];
  forbiddenActions: string[];
  currentProject?: string;
  focusAreas: string[];
  learnedHabits: Record<string, any>;
}
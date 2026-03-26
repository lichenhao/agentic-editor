import { query, execute, getRedis } from '../db/index.js';
import { policyEngine } from '../policies/PolicyEngine.js';
import { userProfileManager } from '../domain/services/UserProfileManager.js';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface ApprovalRequest {
  id: string;
  taskId: string;
  subtaskId?: string;
  action: PendingAction;
  status: 'pending' | 'approved' | 'rejected' | 'exempt';
  requestedAt: Date;
  respondedAt?: Date;
  approverId?: string;
  comment?: string;
}

export interface PendingAction {
  type: string;
  description: string;
  tool?: string;
  resource?: string;
  input?: Record<string, any>;
  tenantId: string;
  userId: string;
  agentId?: string;
}

export interface ApprovalDecision {
  approve: boolean;
  exempt?: boolean;
  comment?: string;
}

/**
 * Approval Handler - manages human-in-the-loop approvals
 */
export class ApprovalHandler extends EventEmitter {
  private redis = getRedis();
  private profileManager = userProfileManager;

  /**
   * Request approval for an action
   */
  async requestApproval(
    taskId: string,
    subtaskId: string | undefined,
    action: PendingAction
  ): Promise<ApprovalRequest> {
    // 1. Check if approval is required by policy
    const { required, policy } = await policyEngine.requiresApproval(action.type, {
      tenantId: action.tenantId,
      userId: action.userId,
      tool: action.tool,
      resource: action.resource,
    });

    if (!required) {
      // No approval needed, auto-approve
      return {
        id: 'auto-approved',
        taskId,
        subtaskId,
        action,
        status: 'approved',
        requestedAt: new Date(),
      };
    }

    // 2. Try USER.md auto-decision
    const autoDecision = await this.profileManager.autoDecide(
      action.userId,
      action
    );

    if (autoDecision.action === 'auto_approve') {
      return {
        id: 'auto-approved',
        taskId,
        subtaskId,
        action,
        status: 'approved',
        requestedAt: new Date(),
        comment: `Auto-approved: ${autoDecision.reason}`,
      };
    }

    if (autoDecision.action === 'auto_reject') {
      return {
        id: 'auto-rejected',
        taskId,
        subtaskId,
        action,
        status: 'rejected',
        requestedAt: new Date(),
        comment: `Auto-rejected: ${autoDecision.reason}`,
      };
    }

    // 3. Create approval request
    const id = uuidv4();
    const now = new Date();

    await query(
      `INSERT INTO approvals (id, task_id, subtask_id, action, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, taskId, subtaskId || null, JSON.stringify(action), 'pending', now]
    );

    // 4. Cache the request for quick access
    await this.redis.setex(
      `approval:${id}`,
      3600, // 1 hour TTL
      JSON.stringify({ id, taskId, action, status: 'pending' })
    );

    // 5. Emit event for SSE notification
    this.emit('approval:requested', { id, taskId, action });

    const approvalRequest: ApprovalRequest = {
      id,
      taskId,
      subtaskId,
      action,
      status: 'pending',
      requestedAt: now,
    };

    return approvalRequest;
  }

  /**
   * Process approval decision
   */
  async processDecision(
    requestId: string,
    userId: string,
    decision: ApprovalDecision
  ): Promise<void> {
    // Get the approval request
    const rows = await query<any>(
      'SELECT * FROM approvals WHERE id = $1 AND status = $2',
      [requestId, 'pending']
    );

    if (!rows[0]) {
      throw new Error(`Approval request ${requestId} not found or already processed`);
    }

    const approval = rows[0];
    const action = typeof approval.action === 'string'
      ? JSON.parse(approval.action)
      : approval.action;

    // Update approval record
    const status = decision.approve ? 'approved' : (decision.exempt ? 'exempt' : 'rejected');

    await execute(
      `UPDATE approvals SET action = $1, status = $2, approver_id = $3, comment = $4, created_at = $5 WHERE id = $6`,
      [JSON.stringify(action), status, userId, decision.comment || null, new Date(), requestId]
    );

    // Create exemption record if exempt
    if (decision.exempt) {
      await query(
        `INSERT INTO exemptions (id, task_id, subtask_id, reason, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), approval.task_id, approval.subtask_id, decision.comment || 'user_exempt', new Date()]
      );

      // Learn from user feedback
      await this.profileManager.learnFromFeedback(userId, {
        type: action.type,
        outcome: 'exempted',
        timestamp: new Date().toISOString(),
      });
    }

    // Clear cache
    await this.redis.del(`approval:${requestId}`);

    // Emit event for SSE notification
    this.emit('approval:decided', {
      requestId,
      taskId: approval.task_id,
      status,
      decision: decision.approve ? 'approved' : 'rejected',
    });

    // Notify task to continue
    this.emit(`task:${approval.task_id}:approval`, decision);
  }

  /**
   * Get pending approvals for a user
   */
  async getPendingApprovals(userId: string, tenantId: string): Promise<ApprovalRequest[]> {
    // In a real system, this would filter by user's permissions
    const rows = await query<any>(
      `SELECT a.*, t.input as task_input
       FROM approvals a
       JOIN tasks t ON a.task_id = t.id
       WHERE t.tenant_id = $1 AND a.status = 'pending'
       ORDER BY a.created_at DESC
       LIMIT 20`,
      [tenantId]
    );

    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      subtaskId: row.subtask_id,
      action: typeof row.action === 'string' ? JSON.parse(row.action) : row.action,
      status: row.status,
      requestedAt: row.created_at,
    }));
  }

  /**
   * Get approval by ID
   */
  async getApproval(requestId: string): Promise<ApprovalRequest | null> {
    // Try cache first
    const cached = await this.redis.get(`approval:${requestId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const rows = await query<any>(
      'SELECT * FROM approvals WHERE id = $1',
      [requestId]
    );

    if (!rows[0]) return null;

    const row = rows[0];
    return {
      id: row.id,
      taskId: row.task_id,
      subtaskId: row.subtask_id,
      action: typeof row.action === 'string' ? JSON.parse(row.action) : row.action,
      status: row.status,
      requestedAt: row.created_at,
      respondedAt: row.updated_at,
      approverId: row.approver_id,
      comment: row.comment,
    };
  }

  /**
   * Cancel pending approval
   */
  async cancelApproval(requestId: string): Promise<void> {
    await execute(
      "UPDATE approvals SET status = 'cancelled', updated_at = $1 WHERE id = $2 AND status = 'pending'",
      [new Date(), requestId]
    );

    await this.redis.del(`approval:${requestId}`);
  }
}

export const approvalHandler = new ApprovalHandler();
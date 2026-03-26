import { query } from '../index.js';
import { Policy, PolicyType } from '../../domain/entities/index.js';

export interface CreatePolicyParams {
  tenantId: string;
  name: string;
  type: PolicyType;
  condition: Record<string, any>;
  action: Record<string, any>;
  priority?: number;
  enabled?: boolean;
}

export class PolicyRepository {
  async findById(id: string): Promise<Policy | null> {
    const rows = await query<any>(
      'SELECT * FROM policies WHERE id = $1',
      [id]
    );
    return rows[0] ? this.mapToPolicy(rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<Policy[]> {
    const rows = await query<any>(
      'SELECT * FROM policies WHERE tenant_id = $1 AND enabled = true ORDER BY priority DESC',
      [tenantId]
    );
    return rows.map(row => this.mapToPolicy(row));
  }

  async findByType(type: PolicyType, tenantId: string): Promise<Policy[]> {
    const rows = await query<any>(
      'SELECT * FROM policies WHERE type = $1 AND tenant_id = $2 AND enabled = true ORDER BY priority DESC',
      [type, tenantId]
    );
    return rows.map(row => this.mapToPolicy(row));
  }

  async findPermissionPolicies(tenantId: string): Promise<Policy[]> {
    return this.findByType('permission', tenantId);
  }

  async findApprovalPolicies(tenantId: string): Promise<Policy[]> {
    return this.findByType('approval', tenantId);
  }

  async findSecurityPolicies(tenantId: string): Promise<Policy[]> {
    return this.findByType('security', tenantId);
  }

  async findIterationPolicies(tenantId: string): Promise<Policy[]> {
    return this.findByType('iteration', tenantId);
  }

  async create(params: CreatePolicyParams): Promise<Policy> {
    const id = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO policies (id, tenant_id, name, type, condition, action, priority, enabled, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        params.tenantId,
        params.name,
        params.type,
        JSON.stringify(params.condition),
        JSON.stringify(params.action),
        params.priority || 0,
        params.enabled !== false,
        1,
        now,
        now,
      ]
    );

    return {
      id,
      tenantId: params.tenantId,
      name: params.name,
      type: params.type,
      condition: params.condition,
      action: params.action,
      priority: params.priority || 0,
      enabled: params.enabled !== false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, data: Partial<Policy>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.condition !== undefined) {
      sets.push(`condition = $${paramIndex++}`);
      values.push(JSON.stringify(data.condition));
    }
    if (data.action !== undefined) {
      sets.push(`action = $${paramIndex++}`);
      values.push(JSON.stringify(data.action));
    }
    if (data.priority !== undefined) {
      sets.push(`priority = $${paramIndex++}`);
      values.push(data.priority);
    }
    if (data.enabled !== undefined) {
      sets.push(`enabled = $${paramIndex++}`);
      values.push(data.enabled);
    }

    sets.push(`version = version + 1`);
    sets.push(`updated_at = $${paramIndex++}`);
    values.push(new Date());

    values.push(id);

    await query(
      `UPDATE policies SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM policies WHERE id = $1', [id]);
  }

  async enable(id: string): Promise<void> {
    await query(
      'UPDATE policies SET enabled = true, updated_at = $1 WHERE id = $2',
      [new Date(), id]
    );
  }

  async disable(id: string): Promise<void> {
    await query(
      'UPDATE policies SET enabled = false, updated_at = $1 WHERE id = $2',
      [new Date(), id]
    );
  }

  private mapToPolicy(row: any): Policy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      type: row.type,
      condition: typeof row.condition === 'string' ? JSON.parse(row.condition) : row.condition,
      action: typeof row.action === 'string' ? JSON.parse(row.action) : row.action,
      priority: row.priority,
      enabled: row.enabled,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const policyRepository = new PolicyRepository();
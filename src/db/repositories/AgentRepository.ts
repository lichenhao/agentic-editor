import { Agent, AgentTemplate } from '../../domain/entities/index.js';
import { query } from '../index.js';

export interface CreateAgentParams {
  tenantId: string;
  name: string;
  role: 'supervisor' | 'specialist' | 'spec-skill';
  systemPrompt: string;
  tools?: string[];
  templateId?: string;
  soulMd?: string;
  agentsMd?: string;
  memoryMd?: string;
}

export interface CreateTemplateParams {
  tenantId: string;
  name: string;
  role: 'supervisor' | 'specialist' | 'spec-skill';
  systemPrompt: string;
  tools?: string[];
  capabilities?: string[];
  isPublic?: boolean;
}

export class AgentRepository {
  async findById(id: string): Promise<Agent | null> {
    const rows = await query<any>(
      'SELECT * FROM agents WHERE id = $1',
      [id]
    );
    return rows[0] ? this.mapToAgent(rows[0]) : null;
  }

  async findByTenant(tenantId: string): Promise<Agent[]> {
    const rows = await query<any>(
      'SELECT * FROM agents WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'active']
    );
    return rows.map(row => this.mapToAgent(row));
  }

  async findByRole(role: string, tenantId: string): Promise<Agent[]> {
    const rows = await query<any>(
      'SELECT * FROM agents WHERE role = $1 AND tenant_id = $2 AND status = $3',
      [role, tenantId, 'active']
    );
    return rows.map(row => this.mapToAgent(row));
  }

  async findActive(tenantId: string): Promise<Agent[]> {
    const rows = await query<any>(
      'SELECT * FROM agents WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'active']
    );
    return rows.map(row => this.mapToAgent(row));
  }

  async findByTemplate(templateId: string): Promise<Agent[]> {
    const rows = await query<any>(
      'SELECT * FROM agents WHERE template_id = $1',
      [templateId]
    );
    return rows.map(row => this.mapToAgent(row));
  }

  async create(params: CreateAgentParams): Promise<Agent> {
    const id = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO agents (id, tenant_id, name, role, system_prompt, tools, template_id, soul_md, agents_md, memory_md, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        params.tenantId,
        params.name,
        params.role,
        params.systemPrompt,
        JSON.stringify(params.tools || []),
        params.templateId || null,
        params.soulMd || null,
        params.agentsMd || null,
        params.memoryMd || null,
        'active',
        1,
        now,
        now,
      ]
    );

    return {
      id,
      tenantId: params.tenantId,
      name: params.name,
      role: params.role,
      systemPrompt: params.systemPrompt,
      tools: params.tools || [],
      status: 'active',
      version: 1,
      metrics: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, data: Partial<Agent>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.systemPrompt !== undefined) {
      sets.push(`system_prompt = $${paramIndex++}`);
      values.push(data.systemPrompt);
    }
    if (data.tools !== undefined) {
      sets.push(`tools = $${paramIndex++}`);
      values.push(JSON.stringify(data.tools));
    }
    if (data.status !== undefined) {
      sets.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.soulMd !== undefined) {
      sets.push(`soul_md = $${paramIndex++}`);
      values.push(data.soulMd);
    }
    if (data.agentsMd !== undefined) {
      sets.push(`agents_md = $${paramIndex++}`);
      values.push(data.agentsMd);
    }
    if (data.memoryMd !== undefined) {
      sets.push(`memory_md = $${paramIndex++}`);
      values.push(data.memoryMd);
    }
    if (data.metrics !== undefined) {
      sets.push(`metrics = $${paramIndex++}`);
      values.push(JSON.stringify(data.metrics));
    }

    sets.push(`updated_at = $${paramIndex++}`);
    values.push(new Date());

    values.push(id);

    await query(
      `UPDATE agents SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async updateMetrics(id: string, metrics: Record<string, any>): Promise<void> {
    const agent = await this.findById(id);
    if (!agent) return;

    const updatedMetrics = { ...agent.metrics, ...metrics };
    await query(
      'UPDATE agents SET metrics = $1, updated_at = $2 WHERE id = $3',
      [JSON.stringify(updatedMetrics), new Date(), id]
    );
  }

  async softDelete(id: string): Promise<void> {
    await query(
      'UPDATE agents SET status = $1, updated_at = $2 WHERE id = $3',
      ['inactive', new Date(), id]
    );
  }

  async getAssessmentHistory(agentId: string, limit = 10): Promise<any[]> {
    return await query(
      `SELECT * FROM assessment_records WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [agentId, limit]
    );
  }

  async getConsecutiveRejections(agentId: string): Promise<number> {
    const rows = await query<any>(
      `SELECT assessment_result FROM assessment_records
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, 10]
    );

    let count = 0;
    for (const row of rows) {
      if (row.assessment_result === 'recreate') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  // Template methods
  async findTemplateById(id: string): Promise<AgentTemplate | null> {
    const rows = await query<any>(
      'SELECT * FROM agent_templates WHERE id = $1',
      [id]
    );
    return rows[0] ? this.mapToTemplate(rows[0]) : null;
  }

  async findTemplatesByTenant(tenantId: string): Promise<AgentTemplate[]> {
    const rows = await query<any>(
      'SELECT * FROM agent_templates WHERE tenant_id = $1 OR is_public = true',
      [tenantId]
    );
    return rows.map(row => this.mapToTemplate(row));
  }

  async createTemplate(params: CreateTemplateParams): Promise<AgentTemplate> {
    const id = crypto.randomUUID();
    const now = new Date();

    await query(
      `INSERT INTO agent_templates (id, tenant_id, name, role, system_prompt, tools, capabilities, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        params.tenantId,
        params.name,
        params.role,
        params.systemPrompt,
        JSON.stringify(params.tools || []),
        JSON.stringify(params.capabilities || []),
        params.isPublic || false,
        now,
        now,
      ]
    );

    return {
      id,
      tenantId: params.tenantId,
      name: params.name,
      role: params.role,
      systemPrompt: params.systemPrompt,
      tools: params.tools || [],
      capabilities: params.capabilities || [],
      isPublic: params.isPublic || false,
      createdAt: now,
      updatedAt: now,
    };
  }

  private mapToAgent(row: any): Agent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      templateId: row.template_id,
      name: row.name,
      role: row.role,
      systemPrompt: row.system_prompt,
      tools: typeof row.tools === 'string' ? JSON.parse(row.tools) : row.tools || [],
      status: row.status,
      version: row.version,
      parentAgentId: row.parent_agent_id,
      metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics || {},
      soulMd: row.soul_md,
      agentsMd: row.agents_md,
      memoryMd: row.memory_md,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToTemplate(row: any): AgentTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      role: row.role,
      systemPrompt: row.system_prompt,
      tools: typeof row.tools === 'string' ? JSON.parse(row.tools) : row.tools || [],
      capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities || [],
      isPublic: row.is_public,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const agentRepository = new AgentRepository();
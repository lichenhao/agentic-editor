import { Policy, PolicyType } from '../domain/entities/index.js';
import { policyRepository } from '../db/repositories/PolicyRepository.js';

export interface PolicyContext {
  tenantId: string;
  userId?: string;
  agentId?: string;
  taskId?: string;
  tool?: string;
  action?: string;
  resource?: string;
  resourceType?: string;
  [key: string]: any;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  policyId?: string;
  action?: Record<string, any>;
}

export class PolicyEngine {
  /**
   * Check if an action is allowed based on permission policies
   */
  async checkPermission(
    action: string,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    const policies = await policyRepository.findPermissionPolicies(context.tenantId);

    // Sort by priority (highest first)
    const sortedPolicies = policies.sort((a, b) => b.priority - a.priority);

    for (const policy of sortedPolicies) {
      if (this.evaluateCondition(policy.condition, { action, ...context })) {
        const actionResult = policy.action as any;
        return {
          allowed: actionResult.allow !== false, // Default to allow
          reason: policy.name,
          policyId: policy.id,
          action: actionResult,
        };
      }
    }

    // Default: deny if no policy matches
    return { allowed: false, reason: 'default_deny' };
  }

  /**
   * Check if an action requires approval
   */
  async requiresApproval(
    action: string,
    context: PolicyContext
  ): Promise<{ required: boolean; policy?: Policy }> {
    const policies = await policyRepository.findApprovalPolicies(context.tenantId);

    for (const policy of policies) {
      if (this.evaluateCondition(policy.condition, { action, ...context })) {
        return { required: true, policy };
      }
    }

    return { required: false };
  }

  /**
   * Check security policy
   */
  async checkSecurity(
    context: PolicyContext
  ): Promise<PolicyDecision> {
    const policies = await policyRepository.findSecurityPolicies(context.tenantId);

    for (const policy of policies) {
      if (this.evaluateCondition(policy.condition, context)) {
        const actionResult = policy.action as any;
        return {
          allowed: actionResult.allow !== false,
          reason: policy.name,
          policyId: policy.id,
          action: actionResult,
        };
      }
    }

    // Default: allow security checks that don't match
    return { allowed: true };
  }

  /**
   * Evaluate a policy condition against context
   */
  evaluateCondition(condition: Record<string, any>, context: PolicyContext): boolean {
    // Support various condition types
    if (condition.tool) {
      if (!this.evaluateOperator(condition.tool, context.tool)) {
        return false;
      }
    }

    if (condition.action) {
      if (!this.evaluateOperator(condition.action, context.action)) {
        return false;
      }
    }

    if (condition.resource) {
      if (!this.evaluateOperator(condition.resource, context.resource)) {
        return false;
      }
    }

    // Support path-based conditions (e.g., /prod/*)
    if (condition.pathPattern) {
      const path = context.resource || '';
      if (!this.matchPathPattern(condition.pathPattern, path)) {
        return false;
      }
    }

    // Support role-based conditions
    if (condition.role) {
      const userRole = context.userRole || 'user';
      if (!this.evaluateOperator(condition.role, userRole)) {
        return false;
      }
    }

    // Support custom field conditions
    for (const [key, expected] of Object.entries(condition)) {
      if (['tool', 'action', 'resource', 'pathPattern', 'role'].includes(key)) {
        continue; // Already handled
      }

      const actual = context[key];
      if (!this.evaluateOperator(expected, actual)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate operator (equals, contains, startsWith, etc.)
   */
  private evaluateOperator(expected: any, actual: any): boolean {
    if (expected === undefined || expected === null) {
      return true;
    }

    // Handle operators as object { op: 'equals', value: ... }
    if (typeof expected === 'object' && expected.op) {
      switch (expected.op) {
        case 'equals':
          return actual === expected.value;
        case 'notEquals':
          return actual !== expected.value;
        case 'contains':
          return typeof actual === 'string' && actual.includes(expected.value);
        case 'startsWith':
          return typeof actual === 'string' && actual.startsWith(expected.value);
        case 'endsWith':
          return typeof actual === 'string' && actual.endsWith(expected.value);
        case 'in':
          return Array.isArray(expected.value) && expected.value.includes(actual);
        case 'notIn':
          return Array.isArray(expected.value) && !expected.value.includes(actual);
        case 'regex':
          return typeof actual === 'string' && new RegExp(expected.value).test(actual);
        case 'gt':
          return Number(actual) > Number(expected.value);
        case 'gte':
          return Number(actual) >= Number(expected.value);
        case 'lt':
          return Number(actual) < Number(expected.value);
        case 'lte':
          return Number(actual) <= Number(expected.value);
        default:
          return actual === expected;
      }
    }

    // Simple equality
    return actual === expected;
  }

  /**
   * Match path pattern (supports wildcards)
   */
  private matchPathPattern(pattern: string, path: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`).test(path);
  }

  /**
   * Create a new policy
   */
  async createPolicy(params: {
    tenantId: string;
    name: string;
    type: PolicyType;
    condition: Record<string, any>;
    action: Record<string, any>;
    priority?: number;
  }): Promise<Policy> {
    return policyRepository.create(params);
  }

  /**
   * Update an existing policy
   */
  async updatePolicy(id: string, data: Partial<Policy>): Promise<void> {
    return policyRepository.update(id, data);
  }

  /**
   * Delete a policy
   */
  async deletePolicy(id: string): Promise<void> {
    return policyRepository.delete(id);
  }
}

export const policyEngine = new PolicyEngine();
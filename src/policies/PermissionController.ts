import { policyEngine, PolicyContext, PolicyDecision } from './PolicyEngine.js';

export interface ToolCall {
  tool: string;
  input: Record<string, any>;
}

export class PermissionController {
  /**
   * Check if a tool call is allowed
   */
  async checkToolPermission(
    toolName: string,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    return policyEngine.checkPermission('tool_call', {
      ...context,
      tool: toolName,
    });
  }

  /**
   * Check if multiple tool calls are allowed
   */
  async checkToolPermissions(
    toolCalls: ToolCall[],
    context: PolicyContext
  ): Promise<{ allowed: boolean; decisions: Map<string, PolicyDecision> }> {
    const decisions = new Map<string, PolicyDecision>();
    let allAllowed = true;

    for (const call of toolCalls) {
      const decision = await this.checkToolPermission(call.tool, {
        ...context,
        toolInput: call.input,
      });

      decisions.set(call.tool, decision);

      if (!decision.allowed) {
        allAllowed = false;
      }
    }

    return { allowed: allAllowed, decisions };
  }

  /**
   * Check if file operation is allowed
   */
  async checkFilePermission(
    operation: 'read' | 'write' | 'delete',
    filePath: string,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    return policyEngine.checkPermission(`file_${operation}`, {
      ...context,
      action: `file_${operation}`,
      resource: filePath,
    });
  }

  /**
   * Check if API call is allowed
   */
  async checkApiPermission(
    method: string,
    path: string,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    return policyEngine.checkPermission('api_call', {
      ...context,
      action: method,
      resource: path,
    });
  }

  /**
   * Check if agent creation is allowed
   */
  async checkAgentCreationPermission(
    role: string,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    return policyEngine.checkPermission('create_agent', {
      ...context,
      action: 'create_agent',
      agentRole: role,
    });
  }

  /**
   * Pre-check all known dangerous operations
   */
  async preFlightCheck(context: PolicyContext): Promise<{
    safe: boolean;
    warnings: string[];
    blocked: string[];
  }> {
    const warnings: string[] = [];
    const blocked: string[] = [];

    // Check for dangerous tools
    const dangerousTools = ['bash', 'exec', 'delete'];
    for (const tool of dangerousTools) {
      const decision = await policyEngine.checkPermission(tool, context);
      if (!decision.allowed) {
        blocked.push(tool);
      } else if (decision.reason && decision.reason !== 'default_deny') {
        warnings.push(`${tool}: ${decision.reason}`);
      }
    }

    return {
      safe: blocked.length === 0,
      warnings,
      blocked,
    };
  }
}

export const permissionController = new PermissionController();
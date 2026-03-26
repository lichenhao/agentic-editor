import { policyEngine, PolicyContext, PolicyDecision } from './PolicyEngine.js';

/**
 * Security boundary - enforces security constraints
 */
export class SecurityBoundary {
  private readonly DANGEROUS_PATHS = [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/sys',
    '/proc',
    '/root',
    '/.ssh',
    '/.aws',
  ];

  private readonly DANGEROUS_TOOLS = [
    'rm',
    'del',
    'format',
    'drop',
    'truncate',
    'shutdown',
    'reboot',
    'kill',
  ];

  /**
   * Check if path is within allowed workspace
   */
  isPathAllowed(filePath: string, workspacePath: string): boolean {
    const resolvedPath = filePath.startsWith('/')
      ? filePath
      : `${workspacePath}/${filePath}`;

    const normalizedPath = resolvedPath.replace(/\/+/g, '/');

    // Check against dangerous paths
    for (const dangerous of this.DANGEROUS_PATHS) {
      if (normalizedPath.startsWith(dangerous)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if command is safe to execute
   */
  isCommandSafe(command: string): { safe: boolean; reason?: string } {
    const cmdLower = command.toLowerCase().trim();

    // Check for dangerous commands
    for (const dangerous of this.DANGEROUS_TOOLS) {
      if (cmdLower.startsWith(dangerous)) {
        return { safe: false, reason: `Dangerous command: ${dangerous}` };
      }
    }

    // Check for command injection patterns
    if (cmdLower.includes('&&') || cmdLower.includes('||') || cmdLower.includes(';')) {
      return { safe: false, reason: 'Command chaining not allowed' };
    }

    // Check for pipe to shell
    if (cmdLower.includes('| sh') || cmdLower.includes('| bash')) {
      return { safe: false, reason: 'Pipe to shell not allowed' };
    }

    // Check for environment variable injection
    if (cmdLower.includes('$(') || cmdLower.includes('`')) {
      return { safe: false, reason: 'Command substitution not allowed' };
    }

    // Check for redirect to sensitive files
    if (cmdLower.includes('> /etc') || cmdLower.includes('> /root')) {
      return { safe: false, reason: 'Redirect to sensitive path not allowed' };
    }

    return { safe: true };
  }

  /**
   * Validate tool input against security rules
   */
  validateToolInput(
    toolName: string,
    input: Record<string, any>,
    workspacePath: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // File tool security
    if (toolName === 'file' || toolName === 'file_read' || toolName === 'file_write') {
      const path = input.path;
      if (path) {
        if (!this.isPathAllowed(path, workspacePath)) {
          errors.push(`Path not allowed: ${path}`);
        }
      }
    }

    // Bash tool security
    if (toolName === 'bash') {
      const command = input.command;
      if (command) {
        const cmdCheck = this.isCommandSafe(command);
        if (!cmdCheck.safe) {
          errors.push(cmdCheck.reason || 'Command not allowed');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check IP whitelist/blacklist
   */
  async checkIpAccess(
    ipAddress: string,
    tenantId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const context: PolicyContext = {
      tenantId,
      ipAddress,
      action: 'access',
    };

    const decision = await policyEngine.checkSecurity(context);

    return {
      allowed: decision.allowed,
      reason: decision.reason,
    };
  }

  /**
   * Rate limiting check (simplified)
   */
  checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number,
    requestCounts: Map<string, { count: number; resetTime: number }>
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const record = requestCounts.get(identifier);

    if (!record) {
      requestCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true };
    }

    if (now > record.resetTime) {
      // Reset window
      requestCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true };
    }

    if (record.count >= maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      };
    }

    record.count++;
    return { allowed: true };
  }

  /**
   * Input sanitization
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>'"]/g, '') // Remove potential HTML/JS
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }
}

export const securityBoundary = new SecurityBoundary();
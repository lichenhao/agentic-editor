import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Tool, ToolContext } from '../ToolRegistry.js';

const execAsync = promisify(exec);

const BashSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  cwd: z.string().optional().describe('Working directory (relative to workspace)'),
  timeout: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute shell commands in the workspace',
  inputSchema: BashSchema,
  async execute(input: any, context: ToolContext): Promise<any> {
    const { command, cwd, timeout } = input;
    const workingDir = cwd
      ? path.join(context.workspacePath, cwd)
      : context.workspacePath;

    try {
      // Security: whitelist allowed commands for production
      const allowedCommands = [
        'ls', 'cat', 'echo', 'pwd', 'find', 'grep', 'git', 'npm', 'bun',
        'node', 'python', 'pip', 'cargo', 'make', 'mkdir', 'touch', 'rm',
        'cp', 'mv', 'chmod', 'tree', 'head', 'tail', 'wc', 'sort', 'uniq',
      ];

      const cmdName = command.split(' ')[0];
      if (!allowedCommands.includes(cmdName) && !cmdName.startsWith('git-')) {
        return {
          success: false,
          error: `Command '${cmdName}' is not allowed for security reasons`,
        };
      }

      // Execute with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: timeout,
        signal: controller.signal as any,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
      });

      clearTimeout(timeoutId);

      return {
        success: true,
        stdout: stdout.slice(0, 50000), // Limit output size
        stderr: stderr.slice(0, 5000),
        exitCode: 0,
      };
    } catch (error: any) {
      if (error.killed) {
        return {
          success: false,
          error: `Command timed out after ${timeout}ms`,
          timedOut: true,
        };
      }

      return {
        success: false,
        error: error.message || String(error),
        stderr: error.stderr || '',
        exitCode: error.code || 1,
      };
    }
  },
};
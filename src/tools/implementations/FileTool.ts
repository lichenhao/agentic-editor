import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolContext } from '../ToolRegistry.js';

const ReadFileSchema = z.object({
  path: z.string().describe('The file path to read'),
});

const WriteFileSchema = z.object({
  path: z.string().describe('The file path to write'),
  content: z.string().describe('The content to write to the file'),
});

const ListDirSchema = z.object({
  path: z.string().describe('The directory path to list'),
});

const FileExistsSchema = z.object({
  path: z.string().describe('The file path to check'),
});

const DeleteFileSchema = z.object({
  path: z.string().describe('The file path to delete'),
});

const CreateDirSchema = z.object({
  path: z.string().describe('The directory path to create'),
});

export const fileTool: Tool = {
  name: 'file',
  description: 'File operations: read, write, list, delete, exists, mkdir',
  inputSchema: z.object({
    operation: z.enum(['read', 'write', 'list', 'delete', 'exists', 'mkdir']).describe('The file operation to perform'),
    path: z.string().describe('The file or directory path'),
    content: z.string().optional().describe('The content to write (for write operation)'),
  }),
  async execute(input: any, context: ToolContext): Promise<any> {
    const { operation, path: filePath, content } = input;
    const fullPath = path.join(context.workspacePath, filePath);

    try {
      switch (operation) {
        case 'read': {
          const data = await fs.readFile(fullPath, 'utf-8');
          return { success: true, content: data };
        }
        case 'write': {
          await fs.writeFile(fullPath, content || '', 'utf-8');
          return { success: true, path: filePath };
        }
        case 'list': {
          const entries = await fs.readdir(fullPath, { withFileTypes: true });
          return {
            success: true,
            entries: entries.map(e => ({
              name: e.name,
              isDirectory: e.isDirectory(),
              isFile: e.isFile(),
            })),
          };
        }
        case 'delete': {
          await fs.rm(fullPath, { recursive: true, force: true });
          return { success: true, path: filePath };
        }
        case 'exists': {
          try {
            await fs.access(fullPath);
            return { success: true, exists: true };
          } catch {
            return { success: true, exists: false };
          }
        }
        case 'mkdir': {
          await fs.mkdir(fullPath, { recursive: true });
          return { success: true, path: filePath };
        }
        default:
          return { success: false, error: `Unknown operation: ${operation}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// Backward compatibility - individual tools
export const readFileTool: Tool = {
  name: 'file_read',
  description: 'Read the contents of a file',
  inputSchema: ReadFileSchema,
  async execute(input: any, context: ToolContext): Promise<any> {
    const fullPath = path.join(context.workspacePath, input.path);
    try {
      const data = await fs.readFile(fullPath, 'utf-8');
      return { success: true, content: data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const writeFileTool: Tool = {
  name: 'file_write',
  description: 'Write content to a file',
  inputSchema: WriteFileSchema,
  async execute(input: any, context: ToolContext): Promise<any> {
    const fullPath = path.join(context.workspacePath, input.path);
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, input.content, 'utf-8');
      return { success: true, path: input.path };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
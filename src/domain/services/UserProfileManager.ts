import { UserProfile } from '../../domain/entities/index.js';
import { query, getRedis } from '../../db/index.js';

export interface PendingAction {
  type: string;
  tool?: string;
  resource?: string;
}

export interface AutoDecision {
  action: 'auto_approve' | 'auto_reject' | 'wait_user';
  reason: string;
}

export interface UserAction {
  type: string;
  outcome: string;
  timestamp: string;
}

/**
 * UserProfileManager - manages USER.md profiles and auto-decisions
 */
export class UserProfileManager {
  private redis = getRedis();

  /**
   * Get user profile (from cache or DB)
   */
  async getProfile(userId: string): Promise<UserProfile> {
    // Try cache first
    const cached = await this.redis.get(`user:${userId}:profile`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Load from database
    const rows = await query<any>(
      'SELECT user_md FROM users WHERE id = $1',
      [userId]
    );

    let profile: UserProfile;

    if (rows[0]?.user_md) {
      profile = this.parseUserMd(rows[0].user_md);
    } else {
      // Default profile
      profile = this.getDefaultProfile();
    }

    // Cache for 1 hour
    await this.redis.setex(`user:${userId}:profile`, 3600, JSON.stringify(profile));

    return profile;
  }

  /**
   * Auto-decide based on user profile
   */
  async autoDecide(userId: string, pendingAction: PendingAction): Promise<AutoDecision> {
    const profile = await this.getProfile(userId);

    // Check learned habits first
    if (profile.learnedHabits && Object.keys(profile.learnedHabits).length > 0) {
      const habitMatch = this.matchesLearnedHabit(profile, pendingAction);
      if (habitMatch) {
        return { action: 'auto_approve', reason: 'matched_habit' };
      }
    }

    // Check autoExecutableActions
    if (profile.autoExecutableActions.includes(pendingAction.type)) {
      return { action: 'auto_approve', reason: 'auto_executable' };
    }

    // Check specific tool in autoExecutableActions
    if (pendingAction.tool && profile.autoExecutableActions.includes(pendingAction.tool)) {
      return { action: 'auto_approve', reason: 'auto_executable_tool' };
    }

    // Check requireConfirmationActions
    if (profile.requireConfirmationActions.includes(pendingAction.type)) {
      return { action: 'wait_user', reason: 'requires_confirmation' };
    }

    if (pendingAction.tool && profile.requireConfirmationActions.includes(pendingAction.tool)) {
      return { action: 'wait_user', reason: 'requires_confirmation_tool' };
    }

    // Check forbiddenActions
    if (profile.forbiddenActions.includes(pendingAction.type)) {
      return { action: 'auto_reject', reason: 'forbidden_action' };
    }

    if (pendingAction.tool && profile.forbiddenActions.includes(pendingAction.tool)) {
      return { action: 'auto_reject', reason: 'forbidden_tool' };
    }

    // Default: wait for user
    return { action: 'wait_user', reason: 'no_matching_rule' };
  }

  /**
   * Learn from user feedback
   */
  async learnFromFeedback(userId: string, action: UserAction): Promise<void> {
    const profile = await this.getProfile(userId);

    // Update learned habits
    profile.learnedHabits = profile.learnedHabits || {};
    profile.learnedHabits[action.type] = {
      outcome: action.outcome,
      lastUpdated: action.timestamp,
    };

    // Save to database
    const userMd = this.serializeUserMd(profile);

    await query(
      'UPDATE users SET user_md = $1, updated_at = $2 WHERE id = $3',
      [userMd, new Date(), userId]
    );

    // Clear cache
    await this.redis.del(`user:${userId}:profile`);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    const profile = await this.getProfile(userId);
    const updatedProfile = { ...profile, ...updates };

    const userMd = this.serializeUserMd(updatedProfile);

    await query(
      'UPDATE users SET user_md = $1, updated_at = $2 WHERE id = $3',
      [userMd, new Date(), userId]
    );

    // Clear cache
    await this.redis.del(`user:${userId}:profile`);
  }

  /**
   * Check if action matches learned habit
   */
  private matchesLearnedHabit(profile: UserProfile, action: PendingAction): boolean {
    const habit = profile.learnedHabits?.[action.type];
    if (!habit) return false;

    // Only trust positive outcomes
    return habit.outcome === 'approved' || habit.outcome === 'exempted';
  }

  /**
   * Parse USER.md format to profile
   */
  private parseUserMd(userMd: string): UserProfile {
    const profile = this.getDefaultProfile();

    if (!userMd) return profile;

    // Simple parsing - extract key sections
    const lines = userMd.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Section headers
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.slice(3).toLowerCase();
        continue;
      }

      // Parse key-value pairs
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();

        switch (key.toLowerCase()) {
          case 'role':
            profile.role = value;
            break;
          case 'techstack':
          case 'tech_stack':
            profile.techStack = value.split(',').map(s => s.trim());
            break;
          case 'replyhabit':
          case 'reply_habit':
            profile.replyHabit = value;
            break;
          case 'language':
            profile.language = value;
            break;
          case 'timeoutthreshold':
          case 'timeout_threshold':
            profile.timeoutThreshold = parseInt(value) || 3600;
            break;
          case 'autoexecutableactions':
          case 'auto_executable_actions':
            profile.autoExecutableActions = value.split(',').map(s => s.trim());
            break;
          case 'requireconfirmationactions':
          case 'require_confirmation_actions':
            profile.requireConfirmationActions = value.split(',').map(s => s.trim());
            break;
          case 'forbiddenactions':
          case 'forbidden_actions':
            profile.forbiddenActions = value.split(',').map(s => s.trim());
            break;
          case 'currentproject':
          case 'current_project':
            profile.currentProject = value;
            break;
          case 'focusareas':
          case 'focus_areas':
            profile.focusAreas = value.split(',').map(s => s.trim());
            break;
        }
      }
    }

    return profile;
  }

  /**
   * Serialize profile to USER.md format
   */
  private serializeUserMd(profile: UserProfile): string {
    const sections: string[] = [];

    sections.push('# User Profile\n');

    sections.push('## Basic Info');
    sections.push(`Role: ${profile.role}`);
    sections.push(`Tech Stack: ${profile.techStack.join(', ')}`);
    sections.push(`Language: ${profile.language}`);
    sections.push('');

    sections.push('## Preferences');
    sections.push(`Reply Habit: ${profile.replyHabit}`);
    sections.push(`Timeout Threshold: ${profile.timeoutThreshold}`);
    sections.push('');

    sections.push('## Authorization');
    sections.push(`Auto Executable Actions: ${profile.autoExecutableActions.join(', ')}`);
    sections.push(`Require Confirmation Actions: ${profile.requireConfirmationActions.join(', ')}`);
    sections.push(`Forbidden Actions: ${profile.forbiddenActions.join(', ')}`);
    sections.push('');

    sections.push('## Project Context');
    if (profile.currentProject) {
      sections.push(`Current Project: ${profile.currentProject}`);
    }
    sections.push(`Focus Areas: ${profile.focusAreas.join(', ')}`);

    return sections.join('\n');
  }

  /**
   * Get default profile
   */
  private getDefaultProfile(): UserProfile {
    return {
      role: 'developer',
      techStack: [],
      replyHabit: 'brief',
      language: 'en',
      timeoutThreshold: 3600,
      autoExecutableActions: ['search', 'file_read', 'web_fetch'],
      requireConfirmationActions: ['file_write', 'bash', 'api_call'],
      forbiddenActions: ['delete', 'system_config', 'drop_database'],
      focusAreas: [],
      learnedHabits: {},
    };
  }
}

export const userProfileManager = new UserProfileManager();
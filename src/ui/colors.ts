/**
 * Cadre Color Theme
 * A warm, pastel color palette for a friendly co-partner CLI experience
 */

import chalk, { Chalk } from 'chalk';

// Core brand colors - warm pastels
export const colors = {
  // Primary colors - agent personality
  warmPeach: chalk.hex('#FFB5A7'),
  softCoral: chalk.hex('#FFC9A8'),
  pastelRose: chalk.hex('#F8B4D9'),

  // Supporting colors - functional states
  mintCream: chalk.hex('#D4F1E8'),
  lavenderMist: chalk.hex('#E6D5F5'),
  butterYellow: chalk.hex('#FFF4C4'),
  skyBlush: chalk.hex('#FFE4E1'),

  // Text and UI elements
  charcoalSoft: chalk.hex('#6B6B6B'),
  warmGray: chalk.hex('#9B9B9B'),
  pearlWhite: chalk.hex('#F8F8F8'),

  // Lighter variations for hover/secondary states
  lightPeach: chalk.hex('#FFDCD3'),
} as const;

/**
 * Semantic color mappings for different UI contexts
 * These provide meaning and consistency across the application
 */
export const theme = {
  // User interaction
  userInput: colors.warmPeach,
  agentResponse: colors.softCoral,
  systemMessage: colors.lavenderMist,
  highlight: colors.pastelRose,

  // Status indicators
  success: colors.mintCream,
  info: colors.lavenderMist,
  warning: colors.butterYellow,
  error: colors.skyBlush,
  progress: colors.softCoral,

  // Text hierarchy
  primary: colors.charcoalSoft,
  secondary: colors.warmGray,
  dim: colors.warmGray,
  emphasis: colors.warmPeach.bold,

  // Code and technical elements
  code: colors.mintCream,
  path: colors.warmGray,
  filename: colors.charcoalSoft,
  lineNumber: colors.butterYellow,

  // Interactive elements
  selected: colors.pastelRose,
  active: colors.warmPeach,
  inactive: colors.warmGray,

  // Symbol types (for code indexing)
  symbolFunction: colors.softCoral,
  symbolClass: colors.mintCream,
  symbolInterface: colors.lavenderMist,
  symbolOther: colors.warmGray,
  symbolExported: colors.pastelRose,

  // Decorative elements
  separator: colors.warmGray,
  border: colors.lightPeach,
  timestamp: colors.warmGray,
} as const;

/**
 * Helper functions for common formatting patterns
 */

/**
 * Format a success message with checkmark
 */
export function formatSuccess(message: string): string {
  return `${theme.success('✓')} ${message}`;
}

/**
 * Format an error message (gentle, supportive)
 */
export function formatError(message: string): string {
  return `${theme.error('✗')} ${message}`;
}

/**
 * Format an info message
 */
export function formatInfo(message: string): string {
  return `${theme.info('ℹ')} ${message}`;
}

/**
 * Format a warning message
 */
export function formatWarning(message: string): string {
  return `${theme.warning('⚠')} ${message}`;
}

/**
 * Format a progress indicator
 */
export function formatProgress(message: string): string {
  return `${theme.progress('→')} ${message}`;
}

/**
 * Format a section header
 */
export function formatHeader(text: string): string {
  return theme.emphasis(text);
}

/**
 * Format a file path with subtle styling
 */
export function formatPath(path: string): string {
  return theme.path(path);
}

/**
 * Format a command or code snippet
 */
export function formatCode(code: string): string {
  return theme.code(code);
}

/**
 * Format a separator line
 */
export function formatSeparator(length: number = 40): string {
  return theme.separator('─'.repeat(length));
}

/**
 * Format a timestamp
 */
export function formatTimestamp(date: Date): string {
  return theme.timestamp(
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );
}

/**
 * Format role-specific text (user vs assistant)
 */
export function formatRole(role: 'user' | 'assistant' | 'system'): InstanceType<typeof Chalk> {
  switch (role) {
    case 'user':
      return theme.userInput;
    case 'assistant':
      return theme.agentResponse;
    case 'system':
      return theme.systemMessage;
  }
}

/**
 * Format a symbol type with appropriate color
 */
export function formatSymbolType(
  type: string,
  exported: boolean = false,
): { color: InstanceType<typeof Chalk>; exportedColor: InstanceType<typeof Chalk> } {
  let color: InstanceType<typeof Chalk>;

  switch (type) {
    case 'function':
      color = theme.symbolFunction;
      break;
    case 'class':
      color = theme.symbolClass;
      break;
    case 'interface':
      color = theme.symbolInterface;
      break;
    default:
      color = theme.symbolOther;
  }

  return {
    color,
    exportedColor: theme.symbolExported,
  };
}

import Conf from 'conf';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env files in order of precedence (later files override earlier)
// 1. .env in home directory (~/.cadre/.env)
// 2. .env in current working directory
const homeEnvPath = path.join(process.env.HOME || '', '.cadre', '.env');
const cwdEnvPath = path.join(process.cwd(), '.env');

if (fs.existsSync(homeEnvPath)) {
  dotenvConfig({ path: homeEnvPath });
}
if (fs.existsSync(cwdEnvPath)) {
  dotenvConfig({ path: cwdEnvPath, override: true });
}

export interface ConfigSchema {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  modelName: string;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  maxSessionTokens: number;
  maxTokensPerMinute: number;
  tokenCostInput: number;
  tokenCostOutput: number;
  systemPrompt?: string;
  saveDirectory?: string;
  warnUnsavedBranchSwitch?: boolean;
}

const config = new Conf<ConfigSchema>({
  projectName: 'cadre',
  defaults: {
    modelName: 'gpt-4o',
    openaiBaseUrl: 'https://api.openai.com/v1',
    maxSessionTokens: 0,
    maxTokensPerMinute: 30000, // 30k tokens per minute default
    tokenCostInput: 5.0, // $5.00 per 1M tokens (GPT-4o approx)
    tokenCostOutput: 15.0, // $15.00 per 1M tokens (GPT-4o approx)
  },
});

/**
 * Get configuration with priority:
 * 1. Environment variables (from .env or shell)
 * 2. Stored config (from conf)
 * 3. Defaults
 */
export const getConfig = (): ConfigSchema => {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || process.env.API_KEY || config.get('openaiApiKey'),
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL || process.env.API_BASE_URL || config.get('openaiBaseUrl'),
    modelName: process.env.MODEL_NAME || process.env.OPENAI_MODEL || config.get('modelName'),
    maxContextTokens: parseInt(process.env.MAX_CONTEXT_TOKENS || '', 10) || 128000,
    maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '', 10) || 16000,
    maxSessionTokens: parseInt(process.env.MAX_SESSION_TOKENS || '', 10) || 0, // 0 = unlimited
    maxTokensPerMinute:
      parseInt(process.env.MAX_TOKENS_PER_MINUTE || '', 10) ||
      config.get('maxTokensPerMinute') ||
      30000,
    tokenCostInput:
      parseFloat(process.env.TOKEN_COST_INPUT || '') || config.get('tokenCostInput') || 5.0,
    tokenCostOutput:
      parseFloat(process.env.TOKEN_COST_OUTPUT || '') || config.get('tokenCostOutput') || 15.0,
    systemPrompt: process.env.SYSTEM_PROMPT || config.get('systemPrompt'),
    saveDirectory: process.env.SAVE_DIRECTORY || config.get('saveDirectory'),
    warnUnsavedBranchSwitch:
      process.env.WARN_UNSAVED_BRANCH_SWITCH === 'true' ||
      config.get('warnUnsavedBranchSwitch') ||
      false,
  };
};

export const setConfig = (key: keyof ConfigSchema, value: string) => {
  config.set(key, value);
};

export const clearConfig = () => {
  config.clear();
};

/**
 * Check if configuration is valid for making API calls.
 */
export const isConfigValid = (): { valid: boolean; missing: string[] } => {
  const cfg = getConfig();
  const missing: string[] = [];

  if (!cfg.openaiApiKey) {
    missing.push('API_KEY or OPENAI_API_KEY');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
};

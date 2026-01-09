#!/usr/bin/env node
import { Command } from 'commander';
import { startInteractiveSession } from './ui/interactive.js';
import { clearConfig, setConfig } from './config.js';

const program = new Command();

program
    .name('cadre')
    .description('On-prem AI Coding Assistant CLI')
    .version('1.0.0');

program.command('start')
    .description('Start the interactive session')
    .action(() => {
        startInteractiveSession();
    });

program.command('config')
    .description('Set configuration')
    .option('--url <url>', 'Set OpenAI Base URL')
    .option('--model <model>', 'Set Model Name')
    .option('--key <key>', 'Set API Key')
    .action((options) => {
        if (options.url) setConfig('openaiBaseUrl', options.url);
        if (options.model) setConfig('modelName', options.model);
        if (options.key) setConfig('openaiApiKey', options.key);
        console.log('Configuration updated.');
    });

program.command('reset')
    .description('Reset configuration')
    .action(() => {
        clearConfig();
        console.log('Configuration reset.');
    });

program.parse();

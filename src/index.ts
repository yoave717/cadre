#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { startInteractiveSession, runSinglePrompt } from './ui/interactive.js';
import { clearConfig, setConfig, getConfig, isConfigValid } from './config.js';
import { getPermissionManager, listPermissions, clearAllPermissions } from './permissions/index.js';
import { LanguageDetector } from './tools/language-detector.js';
import { IndexManager, listIndexedProjects, clearAllIndexes, getIndexStats } from './index-system/index.js';

const program = new Command();

program
  .name('cadre')
  .description('Cadre - AI Coding Assistant CLI')
  .version('1.0.0')
  .argument('[prompt]', 'Optional prompt to run (starts interactive mode if not provided)')
  .option('-p, --print', 'Print response and exit (one-shot mode, no follow-up)')
  .option('--load <file>', 'Load conversation history from file')
  .action(async (prompt, options) => {
    // Check configuration
    const configStatus = isConfigValid();
    if (!configStatus.valid) {
      console.log(chalk.yellow(`⚠ Missing configuration: ${configStatus.missing.join(', ')}`));
      console.log(chalk.dim('Set via .env file or: cadre config --key <your-api-key>'));
      console.log('');
    }

    // Override model if specified
    if (options.model) {
      process.env.MODEL_NAME = options.model;
    }

    if (prompt) {
      // Run with provided prompt
      if (options.print) {
        // One-shot mode: run prompt and exit
        await runSinglePrompt(prompt, options.system);
      } else if (options.continue) {
        // Run prompt then continue interactively
        await startInteractiveSession(prompt, options.system, options.load);
      } else {
        // Default: run prompt then continue interactively
        await startInteractiveSession(prompt, options.system, options.load);
      }
    } else {
      // No prompt provided, start interactive mode
      await startInteractiveSession(undefined, options.system, options.load);
    }
  });

// Config command
program
  .command('config')
  .description('Configure Cadre settings')
  .option('--url <url>', 'Set OpenAI-compatible API base URL')
  .option('-m, --set-model <model>', 'Set default model name')
  .option('--key <key>', 'Set API key')
  .option('--show', 'Show current configuration')
  .action((options) => {
    if (options.show || (!options.url && !options.setModel && !options.key)) {
      const config = getConfig();
      console.log(chalk.bold('\nCadre Configuration:'));
      console.log(chalk.dim(`  Model:    ${config.modelName}`));
      console.log(chalk.dim(`  Endpoint: ${config.openaiBaseUrl}`));
      console.log(
        chalk.dim(
          `  API Key:  ${config.openaiApiKey ? `****${config.openaiApiKey.slice(-4)}` : 'Not set'}`,
        ),
      );
      console.log(chalk.dim(`  Context:  ${config.maxContextTokens} tokens`));
      console.log('');
      return;
    }

    if (options.url) setConfig('openaiBaseUrl', options.url);
    if (options.setModel) setConfig('modelName', options.setModel);
    if (options.key) setConfig('openaiApiKey', options.key);
    console.log(chalk.green('Configuration updated.'));
  });

// Reset command
program
  .command('reset')
  .description('Reset all configuration to defaults')
  .action(() => {
    clearConfig();
    console.log(chalk.green('Configuration reset to defaults.'));
  });

// Permissions command
program
  .command('permissions')
  .description('Manage tool permissions')
  .argument('[action]', 'Action: list, clear')
  .argument('[path]', 'Project path (for revoke)')
  .action(async (action, projectPath) => {
    if (!action || action === 'list') {
      const permissions = await listPermissions();
      const entries = Object.entries(permissions);

      if (entries.length === 0) {
        console.log(chalk.dim('No permissions granted yet.'));
        return;
      }

      console.log(chalk.bold('\nGranted Permissions:'));

      for (const [path, perms] of entries) {
        console.log(chalk.blue(`\n  ${path}`));
        if (perms.bash) console.log(chalk.dim('    ✓ bash (run commands)'));
        if (perms.write) console.log(chalk.dim('    ✓ write (write files)'));
        if (perms.edit) console.log(chalk.dim('    ✓ edit (edit files)'));
        console.log(chalk.dim(`    Granted: ${perms.granted_at}`));
      }
      console.log('');
    } else if (action === 'clear' || action === 'reset') {
      await clearAllPermissions();
      console.log(chalk.green('All permissions cleared.'));
    } else if (action === 'revoke' && projectPath) {
      const manager = getPermissionManager();
      await manager.revoke(projectPath);
      console.log(chalk.green(`Permissions revoked for: ${projectPath}`));
    } else {
      console.log(chalk.yellow('Usage: cadre permissions [list|clear|revoke <path>]'));
    }
  });

// Detect command
program
  .command('detect')
  .description('Detect project primary language and frameworks')
  .option('--frameworks', 'Detect frameworks and libraries')
  .action(async (options) => {
    try {
      const detector = new LanguageDetector();
      const result = await detector.detect();

      console.log(chalk.bold('\nDetected Languages:'));

      const sorted = Object.entries(result.percentages).sort(([, a], [, b]) => b - a);

      for (const [lang, pct] of sorted) {
        if (pct > 0) {
          console.log(chalk.blue(`  ${lang} (${pct}%)`));
        }
      }

      if (result.totalFiles === 0) {
        console.log(chalk.yellow('  No recognized source files found.'));
      }

      console.log(chalk.dim(`\n  Scanned ${result.totalFiles} files.`));

      if (options.frameworks) {
        const { FrameworkDetector } = await import('./tools/framework-detector.js');
        const frameworkDetector = new FrameworkDetector();
        const frameworkResult = await frameworkDetector.detect();

        console.log(chalk.bold('\nDetected Frameworks:'));

        if (frameworkResult.frameworks.length === 0) {
          console.log(chalk.dim('  No common frameworks detected.'));
        } else {
          for (const fw of frameworkResult.frameworks) {
            let output = `  ${fw.name}`;
            if (fw.version) output += ` v${fw.version}`;
            output += ` (${fw.ecosystem})`;

            if (fw.confidence === 'high') {
              console.log(chalk.green(output));
            } else {
              console.log(chalk.yellow(output));
            }
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error(chalk.red(`Error detecting language: ${err.message}`));
    }
  });

// Index command
program
  .command('index')
  .description('Manage project index for fast search')
  .argument('[action]', 'Action: build, update, stats, list, clear')
  .option('--path <path>', 'Project path (defaults to current directory)')
  .action(async (action, options) => {
    const projectPath = options.path || process.cwd();

    try {
      if (!action || action === 'build') {
        // Build index
        const manager = new IndexManager(projectPath);

        // Show progress
        let lastProgress = '';
        const stats = await manager.buildIndex((progress) => {
          let message = '';
          if (progress.phase === 'scanning') {
            message = chalk.blue('🔍 Scanning project files...');
          } else if (progress.phase === 'indexing') {
            const percent = progress.total > 0
              ? Math.round((progress.current / progress.total) * 100)
              : 0;
            message = chalk.blue(
              `📝 Indexing files... ${progress.current}/${progress.total} (${percent}%)`,
            );
            if (progress.currentFile && progress.currentFile.length < 50) {
              message += chalk.dim(` - ${progress.currentFile}`);
            }
          } else if (progress.phase === 'calculating') {
            message = chalk.blue('📊 Calculating statistics...');
          } else if (progress.phase === 'saving') {
            message = chalk.blue('💾 Saving index to disk...');
          }

          // Clear previous line and write new progress
          if (lastProgress) {
            process.stdout.write('\r\x1b[K');
          }
          process.stdout.write(message);
          lastProgress = message;
        });

        // Clear progress line and show final results
        if (lastProgress) {
          process.stdout.write('\r\x1b[K');
        }

        console.log(chalk.green('✓ Index built successfully!\n'));
        console.log(`Files indexed: ${chalk.bold(stats.totalFiles.toString())}`);
        console.log(`Symbols found: ${chalk.bold(stats.totalSymbols.toString())}`);
        console.log(`Total size: ${chalk.bold((stats.totalSize / 1024).toFixed(2))} KB`);
        console.log(`Duration: ${chalk.bold(stats.duration.toString())} ms\n`);

        if (Object.keys(stats.languages).length > 0) {
          console.log(chalk.bold('Languages:'));
          for (const [lang, count] of Object.entries(stats.languages)) {
            console.log(`  ${lang}: ${count} files`);
          }
        }
      } else if (action === 'update') {
        // Update index
        console.log(chalk.blue('Updating project index...'));
        const manager = new IndexManager(projectPath);
        const loaded = await manager.load();

        if (!loaded) {
          console.log(chalk.yellow('No existing index found. Use "build" to create one.'));
          return;
        }

        const stats = await manager.updateIndex();
        console.log(chalk.green('\n✓ Index updated successfully!\n'));
        console.log(`Files indexed: ${chalk.bold(stats.totalFiles.toString())}`);
        console.log(`Symbols found: ${chalk.bold(stats.totalSymbols.toString())}`);
        console.log(`Duration: ${chalk.bold(stats.duration.toString())} ms`);
      } else if (action === 'stats') {
        // Show stats
        const stats = await getIndexStats(projectPath);

        if (!stats) {
          console.log(chalk.yellow('No index found for this project.'));
          return;
        }

        console.log(chalk.bold('\nProject Index Statistics\n'));
        console.log(`Total files: ${chalk.blue(stats.files.toString())}`);
        console.log(`Total symbols: ${chalk.blue(stats.symbols.toString())}`);
        console.log(`Index size: ${chalk.blue((stats.size / 1024).toFixed(2))} KB`);
        console.log(`Last indexed: ${chalk.blue(new Date(stats.indexed_at).toLocaleString())}\n`);
      } else if (action === 'list') {
        // List all indexed projects
        const projects = await listIndexedProjects();

        if (projects.length === 0) {
          console.log(chalk.dim('No indexed projects found.'));
          return;
        }

        console.log(chalk.bold('\nIndexed Projects:\n'));
        for (const project of projects) {
          console.log(chalk.blue(`  ${project.path}`));
          console.log(chalk.dim(`    Hash: ${project.hash}`));
          console.log(chalk.dim(`    Indexed: ${new Date(project.indexed_at).toLocaleString()}`));
        }
        console.log('');
      } else if (action === 'clear') {
        // Clear all indexes
        await clearAllIndexes();
        console.log(chalk.green('All indexes cleared.'));
      } else {
        console.log(chalk.yellow('Usage: cadre index [build|update|stats|list|clear]'));
      }
    } catch (error) {
      const err = error as Error;
      console.error(chalk.red(`Error managing index: ${err.message}`));
    }
  });

// Parse and run
program.parse();

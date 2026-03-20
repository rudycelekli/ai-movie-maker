// ============================================================================
// AI MOVIE MAKER — Interactive CLI
// Walk the user through creating a movie concept step by step.
// ============================================================================

import 'dotenv/config';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ProjectRunner } from './engine/project-runner.js';
import type { InitialInput } from './engine/formula-engine.js';
import type { Genre, ProjectFormat } from './types/index.js';

async function main() {
  console.log(chalk.bold.cyan(`
  ╔══════════════════════════════════════╗
  ║       AI MOVIE MAKER  v0.1.0        ║
  ║    Formula-Driven Film Production    ║
  ╚══════════════════════════════════════╝
  `));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('  Missing ANTHROPIC_API_KEY in .env file!'));
    console.error(chalk.yellow('  Add your key: ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  // ── Gather Input ──

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'Movie/show title:',
      default: 'Untitled Project',
    },
    {
      type: 'list',
      name: 'genre',
      message: 'Genre:',
      choices: [
        'drama', 'comedy', 'horror', 'thriller', 'romance',
        'action', 'sci-fi', 'fantasy', 'mystery', 'crime',
        'adventure', 'animation', 'family',
      ],
    },
    {
      type: 'list',
      name: 'format',
      message: 'Format:',
      choices: [
        { name: 'Feature Film (90-120 min)', value: 'feature-film' },
        { name: 'Short Film (5-30 min)', value: 'short-film' },
        { name: 'TV Series Episode', value: 'tv-series' },
        { name: 'Ad/Commercial', value: 'ad-commercial' },
      ],
    },
    {
      type: 'input',
      name: 'mainPlot',
      message: 'Describe the main plot (or press Enter to let AI generate):',
    },
    {
      type: 'input',
      name: 'tone',
      message: 'Describe the tone/feel (or press Enter for default):',
    },
    {
      type: 'input',
      name: 'intendedEnding',
      message: 'How should it end? (or press Enter to let AI decide):',
    },
    {
      type: 'number',
      name: 'targetDuration',
      message: 'Target duration in minutes:',
      default: 90,
    },
    {
      type: 'confirm',
      name: 'kidMode',
      message: 'Enable Kid-Friendly mode?',
      default: false,
    },
    {
      type: 'list',
      name: 'kidAgeRange',
      message: 'Kid age range:',
      choices: [
        { name: 'Toddlers (2-5)', value: 'toddler' },
        { name: 'Kids (6-9)', value: 'kids' },
        { name: 'Tweens (10-12)', value: 'tweens' },
      ],
      when: (a: Record<string, unknown>) => a.kidMode === true,
    },
    {
      type: 'list',
      name: 'stopPhase',
      message: 'How far should we generate?',
      choices: [
        { name: 'Concept only (quick test)', value: 'concept' },
        { name: 'Through milestones (story beats)', value: 'milestones' },
        { name: 'Through characters', value: 'characters' },
        { name: 'Through locations', value: 'locations' },
        { name: 'Through scenes', value: 'scenes' },
        { name: 'Full pipeline (through shots)', value: 'shots' },
      ],
    },
  ]);

  const input: InitialInput = {
    title: answers.title,
    genre: answers.genre as Genre,
    format: answers.format as ProjectFormat,
    mainPlot: answers.mainPlot || undefined,
    tone: answers.tone || undefined,
    intendedEnding: answers.intendedEnding || undefined,
    targetDuration: answers.targetDuration,
    automationLevel: 'full-auto',
    kidMode: answers.kidMode,
    kidAgeRange: answers.kidAgeRange,
  };

  console.log(chalk.gray('\n  Starting pipeline...\n'));

  const runner = new ProjectRunner();
  const spinner = ora({ text: 'Generating concept...', spinner: 'dots' }).start();

  try {
    const startTime = Date.now();

    const result = await runner.runFullPipeline(input, {
      stopAfterPhase: answers.stopPhase,
      scenesToGenerate: 2,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    spinner.succeed(chalk.green(`Done in ${elapsed}s`));

    // Print concept
    if (result.concept) {
      console.log(chalk.bold.cyan('\n  ═══ YOUR MOVIE ═══\n'));
      console.log(chalk.bold(`  ${input.title}`));
      console.log(chalk.yellow(`  "${result.concept.logline}"\n`));
      console.log(chalk.gray(`  Theme: ${result.concept.theme}`));
      console.log(chalk.gray(`  Style: ${result.concept.visualStyleRecommendation}`));
      console.log(chalk.gray(`  Audience: ${result.concept.targetAudience}\n`));
      console.log(chalk.white(`  ${result.concept.synopsis}\n`));
    }

    if (result.milestones) {
      console.log(chalk.bold.cyan('  ═══ STORY BEATS ═══\n'));
      for (const m of result.milestones.milestones) {
        console.log(chalk.white(`  [${m.beatId}] ${m.title}`));
        console.log(chalk.gray(`    ${m.description}\n`));
      }
    }

    if (result.characters) {
      console.log(chalk.bold.cyan('  ═══ CHARACTERS ═══\n'));
      for (const c of result.characters.characters) {
        console.log(chalk.white(`  ${c.name} — ${c.role} (${c.importance})`));
        console.log(chalk.gray(`    ${c.personality.slice(0, 150)}\n`));
      }
    }

    if (result.locations) {
      console.log(chalk.bold.cyan('  ═══ LOCATIONS ═══\n'));
      for (const l of result.locations.locations) {
        console.log(chalk.white(`  ${l.name} (${l.type})`));
        console.log(chalk.gray(`    ${l.description.slice(0, 150)}\n`));
      }
    }

    if (result.scenes && result.scenes.length > 0) {
      console.log(chalk.bold.cyan(`  ═══ SCENES (${result.scenes.length}) ═══\n`));
      for (const s of result.scenes) {
        console.log(chalk.white(`  ${s.slugline} — "${s.title}"`));
        console.log(chalk.gray(`    ${s.description.slice(0, 120)}...\n`));
      }
    }

    console.log(chalk.bold.green(`\n  Generation complete! (${elapsed}s)\n`));

  } catch (err: unknown) {
    spinner.fail(chalk.red('Failed'));
    if (err instanceof Error) {
      console.error(chalk.red(`\n  ${err.message}\n`));
    }
    process.exit(1);
  }
}

main();

// ============================================================================
// TEST FLOW
// Runs the AI movie maker pipeline with a sample concept.
// Usage: npm test              (concept only — quick test)
//        npm run test:concept  (concept only)
//        npm run test:full     (full pipeline through shots)
// ============================================================================

import 'dotenv/config';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectRunner } from './engine/project-runner.js';
import type { InitialInput } from './engine/formula-engine.js';

// ─── SAMPLE INPUTS ──────────────────────────────────────────────────────────

const SAMPLE_DRAMA: InitialInput = {
  title: 'The Last Lighthouse Keeper',
  genre: 'drama',
  format: 'feature-film',
  mainPlot: 'A retired lighthouse keeper returns to his coastal hometown after 20 years to find the lighthouse scheduled for demolition. He must confront the past he ran from — a tragic accident that took his best friend — while rallying the small community to save the lighthouse.',
  setting: 'A small, windswept coastal town in Maine',
  timePeriod: 'Present day',
  tone: 'Bittersweet and hopeful, like a warm sunrise after a storm',
  intendedEnding: 'The lighthouse is saved but transformed into a community center and memorial. The keeper finally forgives himself and chooses to stay, becoming the bridge between the town\'s past and future.',
  targetDuration: 90,
  automationLevel: 'full-auto',
};

const SAMPLE_COMEDY: InitialInput = {
  title: 'Fake It Till You Bake It',
  genre: 'comedy',
  format: 'feature-film',
  mainPlot: 'A food critic who secretly can\'t cook inherits a famous bakery and must keep it running for 30 days to claim the inheritance. Hilarity ensues as they fake their way through with the help of a grumpy retired baker next door.',
  tone: 'Light, witty, feel-good',
  intendedEnding: 'The critic actually learns to bake, falls in love with the retired baker, and keeps the bakery — but confesses the fraud at the big competition and wins anyway with their own terrible-looking but delicious creation.',
  targetDuration: 95,
  automationLevel: 'full-auto',
};

const SAMPLE_HORROR: InitialInput = {
  title: 'The Hollow Floor',
  genre: 'horror',
  format: 'feature-film',
  mainPlot: 'A young couple renovating a Victorian house discovers a sealed room beneath the floorboards. The previous owner left warnings. Something in the room has been waiting.',
  tone: 'Atmospheric slow-burn with sudden sharp scares',
  intendedEnding: 'They seal the room back up and burn the house down, but in the final shot we see an identical sealed room in their new apartment.',
  targetDuration: 100,
  automationLevel: 'full-auto',
};

const SAMPLE_KID: InitialInput = {
  title: 'Captain Whiskers and the Cloud Kingdom',
  genre: 'adventure',
  format: 'short-film',
  mainPlot: 'A brave kitten named Captain Whiskers discovers a magical rainbow bridge that leads to a kingdom in the clouds, where friendly cloud creatures need help saving their kingdom from the Grumble Storm.',
  tone: 'Fun, colorful, and heartwarming',
  intendedEnding: 'Captain Whiskers defeats the Grumble Storm with kindness, turning it into a gentle rain that makes flowers grow. The cloud creatures and ground animals become friends forever.',
  targetDuration: 15,
  automationLevel: 'full-auto',
  kidMode: true,
  kidAgeRange: 'kids',
  visualStyle: 'colorful cartoon, Pixar-style, bright and cheerful',
};

// ─── CLI ────────────────────────────────────────────────────────────────────

const SAMPLES: Record<string, InitialInput> = {
  drama: SAMPLE_DRAMA,
  comedy: SAMPLE_COMEDY,
  horror: SAMPLE_HORROR,
  kids: SAMPLE_KID,
};

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const phaseFlag = args.find(a => a.startsWith('--phase='))?.split('=')[1]
    || (args.includes('--phase') ? args[args.indexOf('--phase') + 1] : undefined);
  const sampleFlag = args.find(a => a.startsWith('--sample='))?.split('=')[1]
    || (args.includes('--sample') ? args[args.indexOf('--sample') + 1] : undefined);
  const milestonesFlag = args.find(a => a.startsWith('--milestones='))?.split('=')[1];

  const sampleName = sampleFlag || 'drama';
  const input = SAMPLES[sampleName];
  if (!input) {
    console.error(chalk.red(`Unknown sample: ${sampleName}. Available: ${Object.keys(SAMPLES).join(', ')}`));
    process.exit(1);
  }

  const stopAfterPhase = (phaseFlag || 'concept') as 'concept' | 'milestones' | 'characters' | 'locations' | 'scenes' | 'shots';
  const scenesToGen = milestonesFlag ? parseInt(milestonesFlag, 10) : 2;

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\n  Missing ANTHROPIC_API_KEY in .env file!'));
    console.error(chalk.yellow('  Add your key to .env:\n'));
    console.error(chalk.gray('    ANTHROPIC_API_KEY=sk-ant-...\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n  AI Movie Maker — Test Flow\n'));
  console.log(chalk.gray(`  Sample:    ${chalk.white(sampleName)} (${input.title})`));
  console.log(chalk.gray(`  Genre:     ${chalk.white(input.genre)}`));
  console.log(chalk.gray(`  Format:    ${chalk.white(input.format)}`));
  console.log(chalk.gray(`  Stop after: ${chalk.white(stopAfterPhase)}`));
  if (input.kidMode) console.log(chalk.gray(`  Kid Mode:  ${chalk.green('ON')} (${input.kidAgeRange})`));
  console.log();

  const runner = new ProjectRunner();

  const spinner = ora({ text: 'Starting pipeline...', spinner: 'dots' }).start();

  try {
    const startTime = Date.now();
    const result = await runner.runFullPipeline(input, {
      stopAfterPhase,
      scenesToGenerate: scenesToGen,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    spinner.succeed(chalk.green(`Pipeline complete in ${elapsed}s`));

    // ── Print Results ──

    console.log(chalk.bold.cyan('\n  ═══ RESULTS ═══\n'));

    // Concept
    if (result.concept) {
      console.log(chalk.bold.yellow('  📝 CONCEPT'));
      console.log(chalk.white(`  Logline: ${result.concept.logline}`));
      console.log(chalk.gray(`  Theme: ${result.concept.theme}`));
      console.log(chalk.gray(`  Tone: ${result.concept.tone}`));
      console.log(chalk.gray(`  Style: ${result.concept.visualStyleRecommendation}`));
      console.log(chalk.gray(`  Audience: ${result.concept.targetAudience}`));
      console.log(chalk.dim(`\n  Synopsis:\n  ${result.concept.synopsis.slice(0, 500)}...`));
      console.log();
    }

    // Milestones
    if (result.milestones) {
      console.log(chalk.bold.yellow(`  🎯 MILESTONES (${result.milestones.milestones.length})`));
      for (const m of result.milestones.milestones) {
        console.log(chalk.white(`  [${m.beatId}] ${m.title}`));
        console.log(chalk.gray(`    ${m.description.slice(0, 120)}`));
        console.log(chalk.dim(`    Tone: ${m.emotionalTone} | Location: ${m.location} | Stakes: ${m.stakes.slice(0, 60)}`));
      }
      console.log();
    }

    // Characters
    if (result.characters) {
      console.log(chalk.bold.yellow(`  🎭 CHARACTERS (${result.characters.characters.length})`));
      for (const c of result.characters.characters) {
        const app = c.appearance as Record<string, unknown>;
        console.log(chalk.white(`  ${c.name} (${c.role} — ${c.importance})`));
        console.log(chalk.gray(`    ${c.personality.slice(0, 100)}...`));
        console.log(chalk.dim(`    Hair: ${app.hairColor} ${app.hairStyle} | Eyes: ${app.eyeColor} | Build: ${app.build}`));
        if (c.accessories.length > 0) {
          console.log(chalk.dim(`    Accessories: ${c.accessories.map((a: Record<string, unknown>) => a.name).join(', ')}`));
        }
      }
      console.log();
    }

    // Locations
    if (result.locations) {
      console.log(chalk.bold.yellow(`  📍 LOCATIONS (${result.locations.locations.length})`));
      for (const l of result.locations.locations) {
        console.log(chalk.white(`  ${l.name} (${l.type})`));
        console.log(chalk.gray(`    ${l.description.slice(0, 120)}...`));
        console.log(chalk.dim(`    Lighting: ${l.lightingCondition} | Mood: ${l.mood}`));
      }
      console.log();
    }

    // Scenes
    if (result.scenes) {
      console.log(chalk.bold.yellow(`  🎬 SCENES (${result.scenes.length})`));
      for (const s of result.scenes) {
        console.log(chalk.white(`  ${s.slugline}`));
        console.log(chalk.gray(`    ${s.title}: ${s.description.slice(0, 100)}...`));
        console.log(chalk.dim(`    Tension: ${s.tensionLevel}/10 | Duration: ${s.estimatedDurationSeconds}s | Music: ${s.musicMood}`));
        if (s.dialogue.length > 0) {
          const firstLine = s.dialogue[0];
          console.log(chalk.dim(`    First line: ${firstLine.character}: "${firstLine.text.slice(0, 60)}..."`));
        }
      }
      console.log();
    }

    // Shots
    if (result.shots && result.shots.size > 0) {
      console.log(chalk.bold.yellow(`  🎥 SHOTS (${result.shots.size} scenes broken down)`));
      for (const [sceneIdx, shotOutput] of result.shots) {
        const sceneName = result.scenes?.[sceneIdx]?.title || `Scene ${sceneIdx}`;
        console.log(chalk.white(`\n  Scene: "${sceneName}" — ${shotOutput.shots.length} shots`));
        for (const shot of shotOutput.shots) {
          console.log(chalk.gray(`    [${shot.durationSeconds}s] ${shot.description.slice(0, 80)}`));
          console.log(chalk.dim(`      Camera: ${shot.camera.movement} | ${shot.camera.startSize}→${shot.camera.endSize}`));
          console.log(chalk.dim(`      First frame: ${shot.firstFrame.description.slice(0, 80)}...`));
          console.log(chalk.dim(`      Last frame:  ${shot.lastFrame.description.slice(0, 80)}...`));
        }
      }
      console.log();
    }

    // Summary
    console.log(chalk.bold.cyan('  ═══ SUMMARY ═══'));
    console.log(chalk.gray(`  Phases completed: ${stopAfterPhase}`));
    if (result.milestones) console.log(chalk.gray(`  Story beats: ${result.milestones.milestones.length}`));
    if (result.characters) console.log(chalk.gray(`  Characters: ${result.characters.characters.length}`));
    if (result.locations) console.log(chalk.gray(`  Locations: ${result.locations.locations.length}`));
    if (result.scenes) console.log(chalk.gray(`  Scenes: ${result.scenes.length}`));
    if (result.shots) console.log(chalk.gray(`  Shots: ${[...result.shots.values()].reduce((sum, s) => sum + s.shots.length, 0)}`));
    console.log(chalk.gray(`  Time: ${elapsed}s`));
    console.log();

  } catch (err: unknown) {
    spinner.fail(chalk.red('Pipeline failed'));
    if (err instanceof Error) {
      console.error(chalk.red(`\n  ${err.message}`));
      if (err.message.includes('authentication') || err.message.includes('api_key') || err.message.includes('401')) {
        console.error(chalk.yellow('\n  Check your ANTHROPIC_API_KEY in .env'));
      }
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();

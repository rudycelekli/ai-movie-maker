// ============================================================================
// PROJECT RUNNER
// Orchestrates the full pipeline: takes initial input, runs through each
// generation phase, and produces a complete project with all scenes/shots.
// ============================================================================

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AnthropicClient } from './anthropic-client.js';
import { CharacterManager } from './character-manager.js';
import { AIRouter } from './ai-router.js';
import { buildProductionPlan, FORMAT_SPECS, type ProductionPlan } from './production-plan.js';
import type { InitialInput } from './formula-engine.js';
import type { FormulaTemplate } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── PHASE OUTPUTS ───────────────────────────────────────────────────────────

export interface ConceptOutput {
  logline: string;
  synopsis: string;
  theme: string;
  tone: string;
  visualStyleRecommendation: string;
  targetAudience: string;
}

export interface MilestoneOutput {
  milestones: {
    beatId: string;
    title: string;
    description: string;
    emotionalTone: string;
    characters: string[];
    location: string;
    stakes: string;
    causedBy: string | null;
    leadsTo: string | null;
  }[];
}

export interface CharacterOutput {
  characters: {
    name: string;
    role: string;
    importance: string;
    personality: string;
    appearance: Record<string, unknown>;
    defaultOutfit: Record<string, unknown>;
    accessories: Record<string, unknown>[];
    voice: Record<string, unknown>;
    speechPattern: string;
    mannerisms: string[];
    arc: string;
  }[];
}

export interface LocationOutput {
  locations: {
    name: string;
    type: string;
    description: string;
    interior: boolean;
    dimensions: string;
    colorScheme: string[];
    keyFeatures: string[];
    furnitureAndProps: string[];
    lightingCondition: string;
    mood: string;
  }[];
}

export interface SceneOutput {
  scenes: {
    title: string;
    slugline: string;
    description: string;
    purpose: string;
    locationName: string;
    timeOfDay: string;
    characters: {
      name: string;
      outfit: string;
      emotionalState: string;
      action: string;
      continuityFromPrevScene: boolean;
    }[];
    events: { order: number; type: string; description: string }[];
    dialogue: { order: number; character: string; text: string; emotion: string; parenthetical?: string }[];
    tensionLevel: number;
    emotionalTone: string;
    estimatedDurationSeconds: number;
    transitionIn: string;
    transitionOut: string;
    musicMood: string;
  }[];
}

export interface ShotOutput {
  shots: {
    description: string;
    durationSeconds: number;
    camera: {
      movement: string;
      startAngle: string;
      endAngle: string;
      startSize: string;
      endSize: string;
      speed: string;
      stabilization: string;
    };
    firstFrame: {
      description: string;
      backgroundDescription: string;
      characters: {
        name: string;
        pose: string;
        expression: string;
        position: { placement: string; depth: string };
        action: string;
      }[];
      cameraAngle: string;
      shotSize: string;
      focusPoint: string;
      depthOfField: string;
    };
    lastFrame: {
      description: string;
      backgroundDescription: string;
      characters: {
        name: string;
        pose: string;
        expression: string;
        position: { placement: string; depth: string };
        action: string;
      }[];
      cameraAngle: string;
      shotSize: string;
      focusPoint: string;
      depthOfField: string;
    };
    dialogueInShot: string[];
    soundEffects: string[];
  }[];
}

// ─── CONTINUITY PLAN ────────────────────────────────────────────────────────

export interface ContinuityEntry {
  sceneIndex: number;
  sceneTitle: string;
  locationName: string;
  timeOfDay: string;
  weather: string;
  lighting: string;
  characters: {
    name: string;
    outfit: string;
    outfitChanged: boolean;
    accessories: string[];
    emotionalState: string;
    continuityNotes: string;
  }[];
  continuityNotes: string;
}

export interface ContinuityPlan {
  entries: ContinuityEntry[];
}

export interface WardrobeEntry {
  characterName: string;
  sceneIndex: number;
  sceneTitle: string;
  outfitName: string;
  outfitDescription: string;
  outfitDetails: {
    top: string;
    bottom: string;
    footwear: string;
    outerwear: string;
    headwear: string;
  };
}

export interface WardrobePlan {
  wardrobeEntries: WardrobeEntry[];
}

// ─── PROJECT RUNNER ──────────────────────────────────────────────────────────

export class ProjectRunner {
  private claude: AnthropicClient;
  private router: AIRouter;
  private formula: FormulaTemplate | null = null;

  // Production plan (calculated from format)
  private plan: ProductionPlan | null = null;

  // Accumulated state across phases
  private concept: ConceptOutput | null = null;
  private milestones: MilestoneOutput | null = null;
  private characters: CharacterOutput | null = null;
  private locations: LocationOutput | null = null;
  private allScenes: SceneOutput['scenes'] = [];
  private allShots: Map<number, ShotOutput> = new Map();  // sceneIndex → shots

  constructor(apiKey?: string) {
    this.claude = new AnthropicClient(apiKey);
    this.router = new AIRouter();
  }

  // ─── PHASE 1: CONCEPT ──────────────────────────────────────────────────

  async generateConcept(input: InitialInput): Promise<ConceptOutput> {
    console.log('\n--- Phase 1: Generating Concept ---');

    // Build production plan from format
    if (FORMAT_SPECS[input.format]) {
      this.plan = buildProductionPlan(input.format);
      console.log(`  Plan: ${this.plan.formatLabel} — ${this.plan.totalDurationSeconds}s, ~${this.plan.estimatedScenes} scenes, ~${this.plan.estimatedShots} shots`);
    }

    const durationInfo = this.plan
      ? `Target Duration: ${this.plan.totalDurationSeconds} seconds (${this.plan.formatLabel})`
      : input.targetDuration ? `Target Duration: ${input.targetDuration} minutes` : '';

    const budgetInfo = this.plan
      ? `\nPRODUCTION CONSTRAINTS (you MUST fit within these):
- Total duration: ${this.plan.totalDurationSeconds} seconds
- Maximum scenes: ${this.plan.estimatedScenes}
- Maximum characters: ${this.plan.maxCharacters}
- Maximum locations: ${this.plan.maxLocations}
- Story must be COMPLETE within this time — no loose ends`
      : '';

    const systemPrompt = `You are an expert screenwriter and film producer. You create compelling, original concepts perfectly sized for the format. Always respond with valid JSON only.`;

    const userPrompt = `Create a compelling ${input.genre} concept for: ${this.plan?.formatLabel || input.format}.

Title: ${input.title}
Genre: ${input.genre}
Format: ${this.plan?.formatLabel || input.format}
${durationInfo}
${input.mainPlot ? `Main Plot Idea: ${input.mainPlot}` : ''}
${input.setting ? `Setting: ${input.setting}` : ''}
${input.timePeriod ? `Time Period: ${input.timePeriod}` : ''}
${input.tone ? `Tone: ${input.tone}` : ''}
${budgetInfo}
${input.kidMode ? `IMPORTANT: This is for KIDS (age range: ${input.kidAgeRange || 'kids'}). Must be completely child-friendly, educational elements encouraged, positive messages required.` : ''}

Generate a JSON object with:
{
  "logline": "A compelling 1-2 sentence pitch",
  "synopsis": "3-5 paragraph story synopsis covering the full arc",
  "theme": "The central truth this story explores",
  "tone": "Description of the tone and feel",
  "visualStyleRecommendation": "Recommended visual/art style",
  "targetAudience": "Who this is for"
}`;

    this.concept = await this.claude.generateJSON<ConceptOutput>(systemPrompt, userPrompt);
    return this.concept;
  }

  // ─── PHASE 2: MILESTONES ───────────────────────────────────────────────

  async generateMilestones(input: InitialInput): Promise<MilestoneOutput> {
    if (!this.concept) throw new Error('Run generateConcept first');

    console.log('\n--- Phase 2: Generating Story Milestones ---');

    // Load the formula template
    this.formula = await this.loadFormula(input);

    const milestoneLimit = this.plan
      ? `\nIMPORTANT: Generate EXACTLY ${this.plan.estimatedMilestones} milestones (this is a ${this.plan.formatLabel} with only ${this.plan.totalDurationSeconds}s total). Keep each milestone focused and achievable in the time budget.`
      : '';

    const systemPrompt = `You are an expert screenwriter creating story milestones that follow the ${this.formula.name} structure. Every milestone must map to a specific beat. Always respond with valid JSON only.`;

    const beatSummary = this.formula.beats.map(b =>
      `- ${b.id} "${b.name}" (${b.runtimePercentStart}-${b.runtimePercentEnd}%): ${b.purpose}`
    ).join('\n');

    const userPrompt = `Create story milestones for this concept:

LOGLINE: ${this.concept.logline}
SYNOPSIS: ${this.concept.synopsis}
THEME: ${this.concept.theme}
${input.intendedEnding ? `INTENDED ENDING: ${input.intendedEnding}` : ''}
${input.keyMilestones ? `USER-DEFINED MILESTONES:\n${input.keyMilestones.map(m => `- ${m.description}`).join('\n')}` : ''}

FORMULA BEATS (you MUST create a milestone for each):
${beatSummary}

${input.kidMode ? 'IMPORTANT: All content must be child-friendly. No violence, scary content, or inappropriate themes.' : ''}
${milestoneLimit}

Generate JSON:
{
  "milestones": [
    {
      "beatId": "formula beat ID",
      "title": "short title",
      "description": "2-3 sentences of what happens",
      "emotionalTone": "the feeling",
      "characters": ["who is involved"],
      "location": "where it happens",
      "stakes": "what is at risk",
      "causedBy": "which previous milestone causes this (null for first)",
      "leadsTo": "which next milestone this leads to (null for last)"
    }
  ]
}`;

    this.milestones = await this.claude.generateJSON<MilestoneOutput>(systemPrompt, userPrompt);
    return this.milestones;
  }

  // ─── PHASE 3: CHARACTERS ───────────────────────────────────────────────

  async generateCharacters(input: InitialInput): Promise<CharacterOutput> {
    if (!this.concept || !this.milestones) throw new Error('Run previous phases first');

    console.log('\n--- Phase 3: Designing Characters ---');

    const systemPrompt = `You are an expert character designer for ${input.genre} ${input.format}. Create extremely detailed, visually specific character designs. Every visual detail matters because these descriptions will be used to generate consistent AI images across hundreds of scenes. Always respond with valid JSON only.`;

    const userPrompt = `Design all characters for this story:

LOGLINE: ${this.concept.logline}
SYNOPSIS: ${this.concept.synopsis}
MILESTONES:
${this.milestones.milestones.map(m => `- ${m.title}: ${m.description} (characters: ${m.characters.join(', ')})`).join('\n')}

${input.protagonistDescription ? `PROTAGONIST NOTES: ${input.protagonistDescription}` : ''}
${input.antagonistDescription ? `ANTAGONIST NOTES: ${input.antagonistDescription}` : ''}
${input.supportingCharacters ? `SUPPORTING CHARACTER NOTES: ${input.supportingCharacters.join('; ')}` : ''}

VISUAL STYLE: ${this.concept.visualStyleRecommendation}
${input.kidMode ? `KID MODE: Characters must be appealing to ${input.kidAgeRange || 'kids'}. Bright colors, friendly designs, exaggerated features for cartoon style. No intimidating or scary character designs.` : ''}

Characters do NOT have to be human. They can be animals, robots, aliens, monsters, mythical creatures, anthropomorphic objects — ANYTHING the story needs. Adapt appearance fields accordingly.

IMPORTANT: Do NOT create characters for narrators, voiceover artists, or off-screen voices. Only create characters that are VISUALLY PRESENT on screen. Narration should be handled through audio/dialogue direction in scenes, not as character entries.

Generate JSON with ALL characters that are VISUALLY PRESENT in the milestones:
{
  "characters": [
    {
      "name": "full name or title",
      "type": "human|animal|robot|alien|creature|mythical|anthropomorphic|object|abstract|other",
      "species": "specific species/kind if non-human (e.g. golden retriever, battle droid, dragon)",
      "role": "hero|mentor|ally|love-interest|sidekick|antagonist|comic-relief|...",
      "importance": "protagonist|deuteragonist|supporting|minor",
      "personality": "3-5 sentences",
      "appearance": {
        "age": "30 or descriptive (ancient, newborn, ageless)",
        "gender": "... or none for genderless",
        "ethnicity": "... or omit for non-human",
        "height": "short|average|tall|massive|tiny",
        "build": "slim|average|athletic|muscular|heavy|bulky",
        "skinTone": "skin/fur/scales/metal color and texture",
        "hairColor": "specific color or none",
        "hairStyle": "specific style or fur/feathers/surface texture",
        "hairLength": "short|medium|long|none",
        "eyeColor": "specific color",
        "facialHair": "none or description",
        "bodyDescription": "full visual description — critical for non-human characters",
        "distinctiveFeatures": ["specific memorable features — tail, wings, antenna, etc."]
      },
      "defaultOutfit": {
        "top": { "type": "specific garment", "color": "specific color", "material": "optional" },
        "bottom": { "type": "specific garment", "color": "specific color" },
        "footwear": { "type": "specific shoes", "color": "specific color" }
      },
      "accessories": [
        { "type": "jewelry|glasses|watch|...", "name": "item name", "description": "visual description", "wornWhen": "always|usually|sometimes" }
      ],
      "voice": {
        "pitch": "low|medium|high",
        "tone": "warm|cold|raspy|smooth|bright",
        "accent": "specific accent or none",
        "speakingSpeed": "slow|normal|fast"
      },
      "speechPattern": "how they talk",
      "mannerisms": ["habitual behaviors"],
      "arc": "brief arc description"
    }
  ]
}

BE EXTREMELY SPECIFIC about every visual detail. Vague = inconsistent AI images.
${this.plan ? `\nMAX CHARACTERS: ${this.plan.maxCharacters}. Only create the most essential characters for this ${this.plan.formatLabel}.` : ''}`;

    this.characters = await this.claude.generateJSON<CharacterOutput>(systemPrompt, userPrompt);
    return this.characters;
  }

  // ─── PHASE 4: LOCATIONS ────────────────────────────────────────────────

  async generateLocations(input: InitialInput): Promise<LocationOutput> {
    if (!this.concept || !this.milestones || !this.characters) throw new Error('Run previous phases first');

    console.log('\n--- Phase 4: Designing Locations ---');

    const systemPrompt = `You are a production designer for ${input.genre} ${input.format}. Design detailed, visually specific locations. These descriptions will generate panoramic reference images that must remain consistent across all scenes. Always respond with valid JSON only.`;

    const userPrompt = `Design all locations needed for this story:

LOGLINE: ${this.concept.logline}
MILESTONES (with locations):
${this.milestones.milestones.map(m => `- ${m.title} at "${m.location}": ${m.description}`).join('\n')}

CHARACTERS: ${this.characters.characters.map(c => c.name).join(', ')}
VISUAL STYLE: ${this.concept.visualStyleRecommendation}
${input.kidMode ? 'KID MODE: Locations should be colorful, safe-feeling, and appealing to children. No dark/scary environments.' : ''}
${this.plan ? `\nMAX LOCATIONS: ${this.plan.maxLocations}. Only create essential locations for this ${this.plan.formatLabel}. Reuse locations across milestones where possible.` : ''}

Generate JSON with ALL unique locations referenced in milestones:
{
  "locations": [
    {
      "name": "location name",
      "type": "home-interior|office|street|park|school|restaurant|...",
      "description": "Detailed visual description for AI image generation (50+ words)",
      "interior": true,
      "dimensions": "size description (small cozy apartment, vast open field, etc.)",
      "colorScheme": ["#hex1", "#hex2", "#hex3"],
      "keyFeatures": ["specific notable visual elements"],
      "furnitureAndProps": ["specific items in the space"],
      "lightingCondition": "natural-daylight|fluorescent|warm-lamp|neon|...",
      "mood": "the feeling this place evokes"
    }
  ]
}`;

    this.locations = await this.claude.generateJSON<LocationOutput>(systemPrompt, userPrompt);
    return this.locations;
  }

  // ─── PHASE 5: SCENES ──────────────────────────────────────────────────

  async generateScenes(input: InitialInput, milestoneIndex: number): Promise<SceneOutput> {
    if (!this.formula || !this.concept || !this.milestones || !this.characters || !this.locations) {
      throw new Error('Run previous phases first');
    }

    const milestone = this.milestones.milestones[milestoneIndex];
    const beat = this.formula.beats.find(b => b.id === milestone.beatId);
    if (!beat) throw new Error(`Beat ${milestone.beatId} not found in formula`);

    console.log(`\n--- Phase 5: Generating Scenes for "${milestone.title}" (${beat.name}) ---`);

    const prevMilestone = milestoneIndex > 0 ? this.milestones.milestones[milestoneIndex - 1] : null;
    const nextMilestone = milestoneIndex < this.milestones.milestones.length - 1
      ? this.milestones.milestones[milestoneIndex + 1] : null;

    const prevScenesSummary = this.allScenes.length > 0
      ? this.allScenes.slice(-3).map(s => `- "${s.title}": ${s.description}`).join('\n')
      : 'No previous scenes (this is the beginning)';

    // ── Duration budget for this beat ──
    const totalDuration = this.plan?.totalDurationSeconds || 60;
    const totalMilestones = this.milestones.milestones.length;
    const beatRuntimePct = (beat.runtimePercentEnd - beat.runtimePercentStart) / 100;
    const beatDurationBudget = Math.round(totalDuration * beatRuntimePct);
    const numScenes = beat.suggestedSceneCount.min;
    const perSceneBudget = Math.max(8, Math.round(beatDurationBudget / numScenes));

    // How much duration has been used by previously-generated scenes
    const usedDuration = this.allScenes.reduce((sum, s) => sum + (s.estimatedDurationSeconds || 0), 0);
    const remainingDuration = totalDuration - usedDuration;
    const remainingMilestones = totalMilestones - milestoneIndex;

    const visualStyle = this.concept.visualStyleRecommendation || input.visualStyle || 'cinematic photorealistic';

    const systemPrompt = `You are an expert screenwriter AND cinematographer writing scenes for a ${input.genre} ${input.format}. You think like a master director — every scene has deliberate lighting, color, and camera choices that serve the emotional story. You write cinematically — thinking about what the camera sees, how light falls, what objects tell the story, and what the audience feels. Always respond with valid JSON only.`;

    // Hard cap: how many 8s scenes can we still fit?
    const maxScenesRemaining = Math.max(1, Math.floor(remainingDuration / 8));
    const sceneCountMin = Math.min(beat.suggestedSceneCount.min, maxScenesRemaining);
    const sceneCountMax = Math.min(beat.suggestedSceneCount.max, maxScenesRemaining);

    // If no budget left, generate 0 scenes
    if (remainingDuration < 4) {
      console.log(`  Skipping beat "${beat.name}" — no duration budget left (${remainingDuration}s)`);
      return { scenes: [] };
    }

    const userPrompt = `Write ${sceneCountMin === 0 ? 1 : sceneCountMin}-${sceneCountMax === 0 ? 1 : sceneCountMax} scenes for this story beat:

STORY BEAT: "${beat.name}" — ${beat.description}
Purpose: ${beat.purpose}
Tension Level: ${beat.tensionLevel}/10
Emotional Tone: ${beat.emotionalTone}
Pacing: ${beat.pacingSpeed}
Music Mood: ${beat.musicMood}
Runtime: ${beat.runtimePercentStart}%-${beat.runtimePercentEnd}% of total

⏱️ STRICT DURATION BUDGET — YOU MUST OBEY:
- TOTAL PRODUCTION DURATION: ${totalDuration} seconds (${this.plan?.formatLabel || input.format})
- Each scene = EXACTLY 8 seconds (one Veo clip). NO other duration is possible.
- Duration already used by previous scenes: ${usedDuration}s
- Duration remaining: ${remainingDuration}s = room for ${maxScenesRemaining} more scene(s) MAX
- You can generate AT MOST ${sceneCountMax === 0 ? 1 : sceneCountMax} scene(s) for this beat
- If budget is tight, COMBINE multiple story beats into ONE scene rather than exceeding the budget
- Scene durations must be multiples of 8 (since each video clip = 8 seconds)

CURRENT MILESTONE: ${milestone.title} — ${milestone.description}
Stakes: ${milestone.stakes}

WHAT HAPPENED BEFORE:
${prevScenesSummary}

${prevMilestone ? `PREVIOUS MILESTONE: ${prevMilestone.title} — ${prevMilestone.description}` : ''}
${nextMilestone ? `NEXT MILESTONE (building toward): ${nextMilestone.title} — ${nextMilestone.description}` : ''}
${input.intendedEnding ? `STORY ENDING (plant seeds for): ${input.intendedEnding}` : ''}

AVAILABLE CHARACTERS:
${this.characters.characters.map(c => `- ${c.name} (${c.role}): ${c.personality.slice(0, 100)}`).join('\n')}

AVAILABLE LOCATIONS:
${this.locations.locations.map(l => `- ${l.name} (${l.type}): ${l.description.slice(0, 80)}`).join('\n')}

VISUAL STYLE: ${visualStyle}

${input.kidMode ? 'KID MODE: All content must be child-friendly. No violence, scary content, or inappropriate themes.' : ''}

${beat.requiredElements.map(r => `REQUIRED: ${r.description}`).join('\n')}

🎬 CINEMATOGRAPHY — for each scene, design the visual approach like a master director:
- LIGHTING DIRECTION: Be specific — "warm golden-hour side-light casting long shadows" not just "natural". Think about what the light FEELS like.
- COLOR MOOD: Describe the palette emotionally — "desaturated cool blues with one warm accent" or "oversaturated tropical greens"
- VISUAL MOTIF: A recurring visual element that reinforces the theme — reflections, shadows, framing through doorways, shallow focus isolating characters
- KEY SHOTS: Plan 3-5 specific shots — at least ONE extreme close-up (eyes, hands), ONE insert/detail of an object that tells the story (a half-empty glass, a ticking clock, rain on glass), and ONE wide establishing shot
- CAMERA PERSONALITY: "Restless handheld" vs "locked-off voyeuristic distance" vs "slow creeping dolly building dread"

Generate JSON:
{
  "scenes": [
    {
      "title": "short scene title",
      "slugline": "INT./EXT. LOCATION - TIME",
      "description": "What happens (3-5 sentences, CONCISE for the time budget)",
      "purpose": "Why this scene exists narratively",
      "locationName": "which location from available list",
      "timeOfDay": "morning|afternoon|evening|night",
      "characters": [
        {
          "name": "character name",
          "outfit": "default or specific outfit description",
          "emotionalState": "their emotional state entering the scene",
          "action": "what they're doing",
          "continuityFromPrevScene": true
        }
      ],
      "events": [
        { "order": 1, "type": "action|dialogue|reaction|revelation", "description": "what happens" }
      ],
      "dialogue": [
        { "order": 1, "character": "name", "text": "what they say", "emotion": "how they say it", "parenthetical": "(optional direction)" }
      ],
      "cinematography": {
        "lightingDirection": "specific lighting — e.g. low-key side lighting with harsh shadows, warm practicals only",
        "colorMood": "emotional color — e.g. desaturated cool blues with warm accent highlights",
        "visualMotif": "visual theme — e.g. characters framed through doorways (trapped), reflections (duality)",
        "keyShots": ["extreme close-up of hands trembling", "wide shot showing isolation", "insert: specific object detail"],
        "cameraPersonality": "camera behavior — e.g. slow deliberate movements, voyeuristic distance"
      },
      "tensionLevel": ${beat.tensionLevel},
      "emotionalTone": "${beat.emotionalTone}",
      "estimatedDurationSeconds": ${perSceneBudget},
      "transitionIn": "${beat.transitionIn || 'cut'}",
      "transitionOut": "${beat.transitionOut || 'cut'}",
      "musicMood": "${beat.musicMood}"
    }
  ]
}

IMPORTANT:
- ⏱️ DURATION IS CRITICAL — each scene's estimatedDurationSeconds MUST respect the budget above. A ${totalDuration}s ${this.plan?.formatLabel || 'production'} cannot have a single scene longer than ${Math.round(totalDuration * 0.4)}s.
- Track character clothing continuity from previous scenes
- Each scene must have a clear goal, conflict, and outcome
- Dialogue should be TIGHT — only 1-3 lines per scene for short formats
- Build toward the NEXT milestone while resolving this beat
- 🎬 CINEMATOGRAPHY IS MANDATORY — every scene MUST have a cinematography block with all 5 fields filled with SPECIFIC, EVOCATIVE choices (not generic defaults)`;

    const result = await this.claude.generateJSON<SceneOutput>(systemPrompt, userPrompt);

    // Accumulate scenes
    this.allScenes.push(...result.scenes);

    return result;
  }

  // ─── CINEMATIC SHOT TEMPLATES ────────────────────────────────────────

  private getShotTemplate(shotCount: number): { role: string; size: string; purpose: string }[] {
    if (shotCount === 1) {
      return [
        { role: 'ESTABLISHING_TO_REVEAL', size: 'wide→close-up', purpose: 'Dolly from environment establishing shot into character close-up for emotional anchor' },
      ];
    }
    if (shotCount === 2) {
      return [
        { role: 'ESTABLISHING_TO_SUBJECT', size: 'wide→medium', purpose: 'Dolly-in from full environment to character action — set the world then introduce the person' },
        { role: 'DETAIL_TO_REACTION', size: 'insert→close-up', purpose: 'Extreme close-up of KEY OBJECT or detail (hands, eyes, texture) then emotional response' },
      ];
    }
    if (shotCount === 3) {
      return [
        { role: 'ESTABLISHING', size: 'wide or extreme-wide', purpose: 'Full environment, atmosphere, mood — NO characters in focus, just the world' },
        { role: 'SUBJECT_ACTION', size: 'medium or medium-close-up', purpose: 'Character doing something — dialogue, physical action, emotional moment' },
        { role: 'DETAIL_INSERT_TO_REACTION', size: 'extreme-close-up→close-up', purpose: 'Key object extreme close-up (hands gripping something, object detail, texture) then pull to face reaction' },
      ];
    }
    // 4+ shots: full coverage
    return [
      { role: 'ESTABLISHING', size: 'extreme-wide or wide', purpose: 'Full environment establishing — atmosphere, lighting, mood. Slow reveal.' },
      { role: 'SUBJECT_ACTION', size: 'medium', purpose: 'Character action, dialogue, body language — the story beat' },
      { role: 'DETAIL_INSERT', size: 'extreme-close-up or insert', purpose: 'KEY OBJECT or environmental detail — hands, textures, objects that tell the story. NO characters in frame.' },
      { role: 'REACTION_PAYOFF', size: 'close-up or extreme-close-up', purpose: 'Character emotional response — fill the frame with the face. The emotional payoff.' },
    ].slice(0, shotCount);
  }

  // ─── PHASE 6: SHOTS ───────────────────────────────────────────────────

  async generateShots(input: InitialInput, sceneIndex: number): Promise<ShotOutput> {
    if (!this.characters || !this.locations) throw new Error('Run previous phases first');

    const scene = this.allScenes[sceneIndex];
    if (!scene) throw new Error(`Scene ${sceneIndex} not found`);

    // Skip scenes with 0 or very short duration
    if (!scene.estimatedDurationSeconds || scene.estimatedDurationSeconds < 2) {
      console.log(`\n--- Phase 6: Skipping "${scene.title}" (${scene.estimatedDurationSeconds || 0}s — too short for shots) ---`);
      return { shots: [] };
    }

    console.log(`\n--- Phase 6: Breaking Down Shots for "${scene.title}" ---`);

    const location = this.locations.locations.find(l => l.name === scene.locationName);
    const sceneCharacters = scene.characters.map(sc =>
      this.characters!.characters.find(c => c.name === sc.name)
    ).filter(Boolean);

    // Calculate shot count from scene duration (each shot = 8s Veo clip)
    const sceneDuration = scene.estimatedDurationSeconds || 16;
    const targetShotCount = Math.max(1, Math.round(sceneDuration / 8));
    const minShots = Math.max(1, targetShotCount - 1);
    const maxShots = targetShotCount + 1;

    // Extract cinematography direction if the scene has it
    const sceneCinematography = (scene as Record<string, unknown>).cinematography as Record<string, unknown> | undefined;
    const cinematographyBlock = sceneCinematography
      ? `\n🎬 DIRECTOR'S CINEMATOGRAPHY DIRECTION FOR THIS SCENE:
- Lighting: ${sceneCinematography.lightingDirection || 'not specified'}
- Color Mood: ${sceneCinematography.colorMood || 'not specified'}
- Visual Motif: ${sceneCinematography.visualMotif || 'not specified'}
- Key Shots the Director Wants: ${Array.isArray(sceneCinematography.keyShots) ? (sceneCinematography.keyShots as string[]).join('; ') : 'not specified'}
- Camera Personality: ${sceneCinematography.cameraPersonality || 'not specified'}
You MUST execute the director's vision — incorporate these lighting, color, and camera choices into every shot.`
      : '';

    const systemPrompt = `You are a WORLD-CLASS CINEMATOGRAPHER — think Roger Deakins, Emmanuel Lubezki, Hoyte van Hoytema. You don't just "cover" a scene — you TELL THE STORY WITH THE CAMERA. Every shot choice, angle, and movement carries emotional meaning. You plan varied, dynamic shot lists that would make a real DP proud. Always respond with valid JSON only.`;

    const userPrompt = `Break this scene into EXACTLY ${minShots}-${maxShots} shots (target: ${targetShotCount} shots). Each shot is EXACTLY 8 seconds (Veo 3.1 clip length). Scene duration: ${sceneDuration}s = ${targetShotCount} shots × 8s.

SCENE: "${scene.title}"
${scene.slugline}
${scene.description}
${cinematographyBlock}

EVENTS:
${scene.events.map(e => `${e.order}. [${e.type}] ${e.description}`).join('\n')}

DIALOGUE:
${scene.dialogue.map(d => `${d.order}. ${d.character}${d.parenthetical ? ' ' + d.parenthetical : ''}: "${d.text}"`).join('\n')}

LOCATION: ${location ? location.description : scene.locationName}
${location ? `LOCATION PROPS & FEATURES: ${(location.furnitureAndProps || []).join(', ')}` : ''}
${location ? `LOCATION MOOD: ${location.mood}` : ''}
VISUAL STYLE: ${input.visualStyle || this.concept?.visualStyleRecommendation || 'cinematic photorealistic'}
EMOTIONAL TONE: ${scene.emotionalTone}
TENSION: ${scene.tensionLevel}/10

CHARACTERS IN SCENE:
${sceneCharacters.map(c => c ? `- ${c.name}: ${JSON.stringify(c.appearance).slice(0, 200)}... Outfit: ${JSON.stringify(c.defaultOutfit)}` : '').join('\n')}

${input.kidMode ? 'KID MODE: Bright, colorful, friendly compositions. No scary angles or dark lighting.' : ''}

🎬 MANDATORY SHOT VARIETY — you MUST include in this scene:
1. At least ONE extreme close-up or close-up of a face/hands/eyes (emotional anchor)
2. At least ONE insert/detail shot of an OBJECT or ENVIRONMENT DETAIL that tells the story (use props from the location — a half-empty cup, a ticking clock, rain on glass, a crumpled note, a phone screen)
3. At least ONE wide/establishing shot showing the character in their space
4. VARY angles: use low-angle (power), high-angle (vulnerability), OTS (conversation), dutch (unease) — NOT just eye-level
5. VARY movement: mix static holds with dolly-ins, tracking shots, pans — match the camera personality to the scene's emotion
6. DESCRIBE LIGHTING in every frame description — color temperature, direction, quality, practical sources

Generate JSON:
{
  "shots": [
    {
      "description": "what happens in this shot — include the EMOTIONAL PURPOSE (why this angle? why this size?)",
      "durationSeconds": 8,
      "camera": {
        "movement": "static|pan-left|dolly-in|tracking-right|crane-up|handheld|steadicam|whip-pan|orbit|...",
        "startAngle": "eye-level|low-angle|high-angle|over-the-shoulder|dutch-angle|birds-eye|pov|...",
        "endAngle": "...",
        "startSize": "extreme-wide|wide|medium-wide|medium|medium-close-up|close-up|extreme-close-up|insert|...",
        "endSize": "...",
        "speed": "slow|normal|fast",
        "stabilization": "locked|smooth|handheld"
      },
      "firstFrame": {
        "description": "COMPLETE visual description of the first frame (50+ words). Include EVERYTHING visible — lighting quality and color, atmosphere, textures, environmental storytelling details.",
        "backgroundDescription": "what's behind the subjects — include atmospheric details (haze, light shafts, reflections, weather, practical light sources)",
        "characters": [
          {
            "name": "character name",
            "pose": "exact body pose (arms, legs, torso position)",
            "expression": "exact facial expression with micro-details",
            "position": { "placement": "left|center|right", "depth": "foreground|midground|background" },
            "action": "what they're physically doing"
          }
        ],
        "cameraAngle": "eye-level|low-angle|high-angle|over-the-shoulder|dutch-angle|birds-eye|pov|...",
        "shotSize": "extreme-wide|wide|medium-wide|medium|medium-close-up|close-up|extreme-close-up|insert|...",
        "focusPoint": "what the camera focuses on (be specific — 'the tremor in her left hand' not just 'character')",
        "depthOfField": "shallow|normal|deep"
      },
      "lastFrame": {
        "description": "COMPLETE visual description of the last frame (50+ words). Show how things CHANGED — emotionally and physically.",
        "backgroundDescription": "background (same as first unless camera moved)",
        "characters": [
          {
            "name": "character name",
            "pose": "how pose changed from first frame",
            "expression": "how expression changed — show the emotional shift",
            "position": { "placement": "...", "depth": "..." },
            "action": "what they're doing now"
          }
        ],
        "cameraAngle": "...",
        "shotSize": "...",
        "focusPoint": "...",
        "depthOfField": "..."
      },
      "dialogueInShot": ["any lines spoken during this shot"],
      "soundEffects": ["any sound effects during this shot"]
    }
  ]
}

MANDATORY SHOT SEQUENCE — you MUST generate shots following this template:
${this.getShotTemplate(targetShotCount).map((t, i) => `
SHOT ${i + 1} — ${t.role} (${t.size})
Purpose: ${t.purpose}
${t.role.includes('DETAIL') || t.role.includes('INSERT') ? 'CRITICAL: This shot focuses on an OBJECT or DETAIL — hands gripping something, a document, a coffee cup, rain drops, a clock, textures. Show the storytelling through THINGS, not just people. Extreme close-up with shallow depth of field and atmospheric lighting.' : ''}
${t.role.includes('ESTABLISHING') ? 'CRITICAL: Show the FULL ENVIRONMENT — architecture, weather, lighting mood, atmospheric details (dust, fog, reflections, light shafts). Characters can be small in frame or absent.' : ''}
${t.role.includes('REACTION') || t.role.includes('PAYOFF') ? 'CRITICAL: FILL THE FRAME with the face. Show micro-expressions, eye detail, emotion. Shallow depth of field, dramatic lighting on the face.' : ''}
`).join('')}

🔗 CONTINUITY — NON-NEGOTIABLE:
- The LAST FRAME of shot N MUST visually match FIRST FRAME of shot N+1
- Same characters, same clothing, same hairstyle, same spatial position
- CHARACTER IDENTITY IS SACRED: Every character MUST look IDENTICAL across ALL shots — same face, same gender, same age, same body, same hair. NEVER change appearance.
- Include FULL outfit descriptions for EVERY character in EVERY frame

🎨 CINEMATIC QUALITY:
- DESCRIBE LIGHTING in every frame — direction, color temperature, quality, practical sources
- Atmospheric details: dust particles, steam, reflections, lens flares, shadows
- Objects tell stories: show hands interacting with things, show environmental texture
- Always stunning composition, dramatic depth, professional film quality`;

    const result = await this.claude.generateJSON<ShotOutput>(systemPrompt, userPrompt);
    this.allShots.set(sceneIndex, result);
    return result;
  }

  // ─── CONTINUITY PLAN ─────────────────────────────────────────────────

  async generateContinuityPlan(): Promise<ContinuityPlan> {
    if (!this.characters || !this.locations || this.allScenes.length === 0) {
      throw new Error('Run previous phases (characters, locations, scenes) first');
    }

    console.log('\n--- Generating Continuity Plan ---');

    const systemPrompt = `You are a script supervisor responsible for continuity across all scenes. Analyze every scene and produce a detailed continuity plan tracking characters, outfits, accessories, locations, lighting, and time of day. Always respond with valid JSON only.`;

    const userPrompt = `Analyze these scenes and produce a scene-by-scene continuity plan.

CHARACTERS:
${this.characters.characters.map(c => `- ${c.name} (${c.role}): default outfit = ${JSON.stringify(c.defaultOutfit)}, accessories = ${JSON.stringify(c.accessories)}`).join('\n')}

LOCATIONS:
${this.locations!.locations.map(l => `- ${l.name}: ${l.description.slice(0, 80)}, lighting: ${l.lightingCondition}, mood: ${l.mood}`).join('\n')}

SCENES:
${this.allScenes.map((s, i) => `Scene ${i}: "${s.title}" at ${s.locationName}, ${s.timeOfDay}. Characters: ${s.characters.map(c => `${c.name} (outfit: ${c.outfit}, continuing from prev: ${c.continuityFromPrevScene})`).join(', ')}`).join('\n')}

For each scene, determine:
- Which characters appear and what they wear
- Whether their outfit changed from the previous scene (and why)
- Which accessories are active
- Location, time of day, weather, and lighting
- Any continuity notes (e.g. "character still has the bandage from scene 3")

Generate JSON:
{
  "entries": [
    {
      "sceneIndex": 0,
      "sceneTitle": "scene title",
      "locationName": "location name",
      "timeOfDay": "morning|afternoon|evening|night",
      "weather": "clear|cloudy|rainy|etc",
      "lighting": "lighting description",
      "characters": [
        {
          "name": "character name",
          "outfit": "outfit description",
          "outfitChanged": false,
          "accessories": ["active accessories"],
          "emotionalState": "emotional state",
          "continuityNotes": "any continuity notes from previous scenes"
        }
      ],
      "continuityNotes": "overall scene continuity notes"
    }
  ]
}`;

    return await this.claude.generateJSON<ContinuityPlan>(systemPrompt, userPrompt);
  }

  // ─── WARDROBE ENHANCEMENT ───────────────────────────────────────────

  async generateWardrobeEnhancement(continuityPlan: ContinuityPlan): Promise<WardrobePlan> {
    if (!this.characters) throw new Error('Characters required');

    console.log('\n--- Generating Wardrobe Enhancement ---');

    const systemPrompt = `You are a costume designer. Based on the continuity plan, generate detailed outfit descriptions for every character in every scene. Always respond with valid JSON only.`;

    const userPrompt = `Design detailed outfits for each character in each scene.

CHARACTERS:
${this.characters.characters.map(c => `- ${c.name}: default outfit = ${JSON.stringify(c.defaultOutfit)}`).join('\n')}

CONTINUITY PLAN:
${continuityPlan.entries.map(e => `Scene ${e.sceneIndex} "${e.sceneTitle}": ${e.characters.map(c => `${c.name} wears "${c.outfit}" (changed: ${c.outfitChanged})`).join(', ')}`).join('\n')}

For each character-scene pair, provide detailed clothing breakdown.

Generate JSON:
{
  "wardrobeEntries": [
    {
      "characterName": "name",
      "sceneIndex": 0,
      "sceneTitle": "scene title",
      "outfitName": "short outfit name",
      "outfitDescription": "full visual description",
      "outfitDetails": {
        "top": "garment description",
        "bottom": "garment description",
        "footwear": "shoe description",
        "outerwear": "jacket/coat or none",
        "headwear": "hat or none"
      }
    }
  ]
}`;

    return await this.claude.generateJSON<WardrobePlan>(systemPrompt, userPrompt);
  }

  // ─── RUN ALL PHASES ────────────────────────────────────────────────────

  async runFullPipeline(input: InitialInput, options: {
    stopAfterPhase?: 'concept' | 'milestones' | 'characters' | 'locations' | 'scenes' | 'shots';
    scenesToGenerate?: number;
  } = {}): Promise<{
    plan?: ProductionPlan;
    concept: ConceptOutput;
    milestones?: MilestoneOutput;
    characters?: CharacterOutput;
    locations?: LocationOutput;
    scenes?: SceneOutput['scenes'];
    shots?: Map<number, ShotOutput>;
    continuityPlan?: ContinuityPlan;
  }> {
    const concept = await this.generateConcept(input);
    if (options.stopAfterPhase === 'concept') return { plan: this.plan ?? undefined, concept };

    const milestones = await this.generateMilestones(input);
    if (options.stopAfterPhase === 'milestones') return { plan: this.plan ?? undefined, concept, milestones };

    const characters = await this.generateCharacters(input);
    if (options.stopAfterPhase === 'characters') return { plan: this.plan ?? undefined, concept, milestones, characters };

    const locations = await this.generateLocations(input);
    if (options.stopAfterPhase === 'locations') return { plan: this.plan ?? undefined, concept, milestones, characters, locations };

    // Generate scenes for ALL milestones
    const scenesToGen = options.scenesToGenerate ?? milestones.milestones.length;
    for (let i = 0; i < Math.min(scenesToGen, milestones.milestones.length); i++) {
      await this.generateScenes(input, i);
    }
    if (options.stopAfterPhase === 'scenes') {
      return { plan: this.plan ?? undefined, concept, milestones, characters, locations, scenes: this.allScenes };
    }

    // Generate shots for ALL scenes
    for (let i = 0; i < this.allScenes.length; i++) {
      await this.generateShots(input, i);
    }

    return {
      plan: this.plan ?? undefined,
      concept,
      milestones,
      characters,
      locations,
      scenes: this.allScenes,
      shots: this.allShots,
    };
  }

  /**
   * Run the pipeline with a callback after each phase completes.
   * This enables streaming / progressive rendering on the client.
   */
  async runPipelineStreaming(
    input: InitialInput,
    onPhase: (phase: string, data: Record<string, unknown>) => void,
    options: { scenesToGenerate?: number } = {}
  ): Promise<void> {
    const concept = await this.generateConcept(input);
    onPhase('concept', { plan: this.plan ?? undefined, concept });

    const milestones = await this.generateMilestones(input);
    onPhase('milestones', { milestones });

    const characters = await this.generateCharacters(input);
    onPhase('characters', { characters });

    const locations = await this.generateLocations(input);
    onPhase('locations', { locations });

    // Scenes — send each milestone's scenes as they complete
    const scenesToGen = options.scenesToGenerate ?? milestones.milestones.length;
    for (let i = 0; i < Math.min(scenesToGen, milestones.milestones.length); i++) {
      await this.generateScenes(input, i);
      onPhase('scenes', { scenes: this.allScenes, milestoneIndex: i });
    }

    // Shots — send each scene's shots as they complete
    for (let i = 0; i < this.allScenes.length; i++) {
      await this.generateShots(input, i);
      const shotsObj: Record<number, unknown> = {};
      for (const [k, v] of this.allShots) shotsObj[k] = v;
      onPhase('shots', { shots: shotsObj, sceneIndex: i });
    }

    onPhase('done', {});
  }

  // ─── REGENERATE A SINGLE PHASE ──────────────────────────────────────

  async regeneratePhase(
    phase: 'concept' | 'milestones' | 'characters' | 'locations' | 'scenes',
    input: InitialInput,
    existingData: {
      concept?: ConceptOutput;
      milestones?: MilestoneOutput;
      characters?: CharacterOutput;
      locations?: LocationOutput;
      scenes?: SceneOutput['scenes'];
      shots?: Record<number, ShotOutput>;
    },
    direction?: string
  ): Promise<Record<string, unknown>> {
    // Rehydrate internal state from existing data
    if (existingData.concept) this.concept = existingData.concept;
    if (existingData.milestones) this.milestones = existingData.milestones;
    if (existingData.characters) this.characters = existingData.characters;
    if (existingData.locations) this.locations = existingData.locations;
    if (existingData.scenes) this.allScenes = existingData.scenes;

    // Build production plan if needed
    if (FORMAT_SPECS[input.format]) {
      this.plan = buildProductionPlan(input.format);
    }

    // If direction is provided, temporarily patch the input
    const modInput = { ...input };
    if (direction) {
      modInput.tone = (modInput.tone || '') + '. Creative direction: ' + direction;
    }

    switch (phase) {
      case 'concept': {
        const result = await this.generateConcept(modInput);
        return { concept: result };
      }
      case 'milestones': {
        if (!this.concept) throw new Error('Cannot regenerate milestones without concept');
        const result = await this.generateMilestones(modInput);
        return { milestones: result };
      }
      case 'characters': {
        if (!this.concept || !this.milestones) throw new Error('Cannot regenerate characters without concept/milestones');
        const result = await this.generateCharacters(modInput);
        return { characters: result };
      }
      case 'locations': {
        if (!this.concept || !this.milestones || !this.characters) throw new Error('Cannot regenerate locations without previous phases');
        const result = await this.generateLocations(modInput);
        return { locations: result };
      }
      case 'scenes': {
        if (!this.concept || !this.milestones || !this.characters || !this.locations) {
          throw new Error('Cannot regenerate scenes without previous phases');
        }
        this.formula = await this.loadFormula(modInput);
        this.allScenes = [];
        for (let i = 0; i < this.milestones.milestones.length; i++) {
          await this.generateScenes(modInput, i);
        }
        return { scenes: this.allScenes };
      }
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────

  private async loadFormula(input: InitialInput): Promise<FormulaTemplate> {
    // Map genre+format to formula file
    // Short formats use three-act-drama (compressed), genre-specific for longer
    const baseFormat = input.format.startsWith('ad-commercial') ? 'ad-commercial' : input.format;
    const formulaMap: Record<string, string> = {
      'drama-short-film': 'three-act-drama',
      'comedy-short-film': 'comedy',
      'horror-short-film': 'horror',
      'thriller-short-film': 'horror',
      'drama-tv-series': 'tv-series-drama',
      'comedy-tv-series': 'tv-series-drama',
    };

    const key = `${input.genre}-${baseFormat}`;
    const formulaId = formulaMap[key] || 'three-act-drama';

    const formulaPath = join(__dirname, '..', 'formulas', `${formulaId}.json`);
    const content = await readFile(formulaPath, 'utf-8');
    return JSON.parse(content) as FormulaTemplate;
  }
}

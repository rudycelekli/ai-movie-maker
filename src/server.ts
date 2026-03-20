// ============================================================================
// WEB SERVER
// Serves the UI and exposes API endpoints for the movie maker pipeline.
// ============================================================================

import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { ProjectRunner } from './engine/project-runner.js';
import type { InitialInput } from './engine/formula-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3456;

// Generated videos directory
const GENERATED_DIR = join(__dirname, '..', 'generated', 'videos');
if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, '..', 'public')));
app.use('/generated', express.static(join(__dirname, '..', 'generated')));

// Store active runners per session (simple in-memory)
const runners = new Map<string, ProjectRunner>();

function getRunner(sessionId: string): ProjectRunner {
  if (!runners.has(sessionId)) {
    runners.set(sessionId, new ProjectRunner());
  }
  return runners.get(sessionId)!;
}

// ─── API: Run pipeline phase by phase ───────────────────────────────────────

app.post('/api/generate', async (req, res) => {
  const { input, stopAfterPhase, sessionId } = req.body as {
    input: InitialInput;
    stopAfterPhase: string;
    sessionId: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  const runner = getRunner(sessionId || 'default');

  try {
    const result = await runner.runFullPipeline(input, {
      stopAfterPhase: stopAfterPhase as any,
      scenesToGenerate: 2,
    });

    // Convert Map to plain object for JSON
    const shots: Record<number, unknown> = {};
    if (result.shots) {
      for (const [k, v] of result.shots) shots[k] = v;
    }

    res.json({ ...result, shots });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Streaming pipeline (SSE) — results appear as each phase completes ─

app.post('/api/generate-stream', async (req, res) => {
  const { input, sessionId } = req.body as {
    input: InitialInput;
    sessionId: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const runner = getRunner(sessionId || 'default');

  try {
    await runner.runPipelineStreaming(input, (phase, data) => {
      if (res.writableEnded) return;
      const payload = JSON.stringify({ phase, ...data });
      res.write(`data: ${payload}\n\n`);
    });
  } catch (err: unknown) {
    if (!res.writableEnded) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ phase: 'error', error: message })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

// ─── API: Randomize fields via Claude ───────────────────────────────────────

import { AnthropicClient } from './engine/anthropic-client.js';
import { buildProductionPlan, FORMAT_SPECS } from './engine/production-plan.js';
import { GeminiClient } from './engine/gemini-client.js';

const claude = new AnthropicClient();

// Lazy-init Gemini client (only when GOOGLE_API_KEY is present)
let gemini: GeminiClient | null = null;
function getGemini(): GeminiClient {
  if (!gemini) {
    gemini = new GeminiClient();
  }
  return gemini;
}

app.post('/api/randomize', async (req, res) => {
  const { fields, context, direction } = req.body as {
    fields: string[];
    context: Record<string, string>;
    direction?: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  const allFields = fields.includes('all');
  const fieldsToGen = allFields
    ? ['title', 'genre', 'format', 'mainPlot', 'tone', 'intendedEnding', 'visualStyle']
    : fields;

  // Build rich context from locked fields — resolve raw keys to human-readable descriptions
  const lockedContext: string[] = [];
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      if (!v || fieldsToGen.includes(k)) continue;
      if (k === 'formatDescription') continue; // handled below with format
      if (k === 'format') {
        // Resolve format key to full production constraints
        const spec = FORMAT_SPECS[v];
        if (spec) {
          lockedContext.push(`- FORMAT (LOCKED): ${spec.label} — ${spec.defaultDuration} seconds total, ${spec.scenesRange.min}-${spec.scenesRange.max} scenes, max ${spec.maxCharacters} characters, max ${spec.maxLocations} locations. "${spec.description}"`);
        } else {
          lockedContext.push(`- format: ${v}`);
        }
      } else if (k === 'genre') {
        lockedContext.push(`- GENRE (LOCKED): ${v} — all content MUST fit this genre. Plot, tone, characters, and visual style must be appropriate for ${v}.`);
      } else {
        lockedContext.push(`- ${k}: ${v}`);
      }
    }
  }

  const contextHint = lockedContext.length > 0
    ? `\n🔒 LOCKED FIELDS — you MUST respect these constraints. Generate everything else to fit WITHIN them:\n${lockedContext.join('\n')}\n\nEverything you generate MUST be perfectly tailored for these locked constraints. A 15-second ad needs a punchy concept, not an epic saga. A short film can be deeper and more nuanced. Match your creativity to the format.`
    : '';

  const directionHint = direction
    ? `\nCreative direction from the user: "${direction}". Use this as strong inspiration.`
    : '';

  const formatOptions = Object.entries(FORMAT_SPECS).map(([k, s]) => `${k} (${s.label}, ${s.defaultDuration}s)`).join(', ');

  // Use timestamp + random to seed diversity
  const diversitySeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const prompt = `Generate creative, original values for a movie/show concept.
${contextHint}${directionHint}

Generate ONLY these fields: ${fieldsToGen.join(', ')}

Rules:
- title: catchy, original movie title (2-5 words)
- genre: one of: drama, comedy, horror, thriller, romance, action, sci-fi, fantasy, mystery, adventure, animation, family
- format: one of: ${formatOptions}
- mainPlot: compelling 2-3 sentence plot synopsis
- tone: short description of mood/feel (e.g., "Dark and atmospheric with dry humor")
- intendedEnding: 1-2 sentence ending description
- visualStyle: art/visual direction (e.g., "Neon-noir cyberpunk", "Warm indie handheld", "Gritty 70s documentary", "Colorful Wes Anderson symmetry")

🎲 DIVERSITY SEED: ${diversitySeed}
Use this seed as creative inspiration — let it push you toward unexpected choices.

🚨 CRITICAL DIVERSITY RULES:
- You MUST vary genre, setting, time period, culture, and tone EVERY call
- Do NOT default to drama, comedy, or ad-commercial — pick from ALL genres and ALL formats equally
- Mix up time periods: ancient, medieval, 1920s, 1960s, near-future, far-future, contemporary, etc.
- Mix up cultures and settings: Tokyo, Lagos, Mumbai, São Paulo, Oslo, Cairo, rural Kansas, space station, underwater city, etc.
- Mix up formats: short films, trailers, music videos, ads of different lengths — give each EQUAL probability
- NEVER repeat "lighthouse keeper", "detective", "small town" or any cliché — be genuinely original
- Think of genres and tones that are RARELY combined: horror-comedy, sci-fi romance, fantasy documentary, animated thriller

Return JSON with only the requested fields.`;

  try {
    const result = await claude.generateJSON<Record<string, unknown>>(
      'You are a creative movie concept generator. Return only valid JSON with the requested fields.',
      prompt,
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Regenerate a single phase ─────────────────────────────────────────

app.post('/api/regenerate', async (req, res) => {
  const { phase, input, currentData, direction, sessionId } = req.body as {
    phase: string;
    input: Record<string, unknown>;
    currentData: Record<string, unknown>;
    direction?: string;
    sessionId: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  const validPhases = ['concept', 'milestones', 'characters', 'locations', 'scenes'];
  if (!validPhases.includes(phase)) {
    res.status(400).json({ error: `Invalid phase: ${phase}. Must be one of: ${validPhases.join(', ')}` });
    return;
  }

  // Use a fresh runner for regeneration to avoid state conflicts
  const runner = new ProjectRunner();

  try {
    const result = await runner.regeneratePhase(
      phase as any,
      input as any,
      currentData as any,
      direction
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Regenerate a single item via AI ────────────────────────────────────

app.post('/api/regenerate-item', async (req, res) => {
  const { type, index, currentData, direction } = req.body as {
    type: string;
    index: number;
    currentData: Record<string, unknown>;
    direction?: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  try {
    const baseType = type.startsWith('shot-') ? 'shot' : type;
    const sceneIdx = type.startsWith('shot-') ? parseInt(type.split('-')[1]) : -1;
    let item: unknown;

    if (baseType === 'concept') item = currentData.concept;
    else if (baseType === 'milestone') item = (currentData.milestones as any)?.milestones?.[index];
    else if (baseType === 'character') item = (currentData.characters as any)?.characters?.[index];
    else if (baseType === 'location') item = (currentData.locations as any)?.locations?.[index];
    else if (baseType === 'scene') item = (currentData.scenes as any)?.[index];
    else if (baseType === 'shot') {
      const group = (currentData.shots as any)?.[sceneIdx] || (currentData.shots as any)?.[String(sceneIdx)];
      item = group?.shots?.[index];
    }

    if (!item) {
      res.status(400).json({ error: 'Item not found' });
      return;
    }

    const concept = (currentData.concept || {}) as Record<string, string>;
    const contextParts = [
      `Movie: "${concept.logline || ''}"`,
      `Theme: ${concept.theme || ''}, Tone: ${concept.tone || ''}`,
      (currentData.characters as any)?.characters ? `Characters: ${(currentData.characters as any).characters.map((c: any) => c.name).join(', ')}` : '',
      (currentData.locations as any)?.locations ? `Locations: ${(currentData.locations as any).locations.map((l: any) => l.name).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const dirHint = direction ? `\nUser creative direction: "${direction}". Use this as strong guidance.` : '';

    const prompt = `You are regenerating a single ${baseType} for a movie project.

PROJECT CONTEXT:
${contextParts}

CURRENT ${baseType.toUpperCase()}:
${JSON.stringify(item, null, 2)}${dirHint}

Generate a fresh, creative replacement for this ${baseType}. Keep it consistent with the project context.
Return ONLY a valid JSON object with the exact same field structure as the current item.`;

    const result = await claude.generateJSON<Record<string, unknown>>(
      `You are a creative movie production AI. Return only valid JSON matching the exact structure of the input ${baseType}.`,
      prompt,
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Continuity Plan ────────────────────────────────────────────────────

app.post('/api/continuity-plan', async (req, res) => {
  const { characters, locations, scenes, input } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  const runner = new ProjectRunner();
  try {
    // Rehydrate runner state for continuity plan generation
    await runner.regeneratePhase('concept', input, { concept: req.body.concept || { logline: '', synopsis: '', theme: '', tone: '', visualStyleRecommendation: '', targetAudience: '' } });

    const systemPrompt = `You are a script supervisor responsible for continuity across all scenes. Analyze every scene and produce a detailed continuity plan tracking characters, outfits, accessories, locations, lighting, and time of day. Always respond with valid JSON only.`;

    const charSummary = (characters?.characters || []).map((c: any) =>
      `- ${c.name} (${c.role}): default outfit = ${JSON.stringify(c.defaultOutfit)}, accessories = ${JSON.stringify(c.accessories || [])}`
    ).join('\n');

    const locSummary = (locations?.locations || []).map((l: any) =>
      `- ${l.name}: ${(l.description || '').slice(0, 80)}, lighting: ${l.lightingCondition || 'natural'}, mood: ${l.mood || ''}`
    ).join('\n');

    const sceneSummary = (scenes || []).map((s: any, i: number) =>
      `Scene ${i}: "${s.title}" at ${s.locationName}, ${s.timeOfDay}. Characters: ${(s.characters || []).map((c: any) => `${c.name} (outfit: ${c.outfit}, continuing: ${c.continuityFromPrevScene})`).join(', ')}`
    ).join('\n');

    const userPrompt = `Analyze these scenes and produce a scene-by-scene continuity plan.

CHARACTERS:\n${charSummary}

LOCATIONS:\n${locSummary}

SCENES:\n${sceneSummary}

For each scene, determine:
- Which characters appear and what they wear
- Whether their outfit changed from the previous scene
- Which accessories are active
- Location, time of day, weather, and lighting
- Continuity notes

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
          "continuityNotes": "notes"
        }
      ],
      "continuityNotes": "overall notes"
    }
  ]
}`;

    const result = await claude.generateJSON(systemPrompt, userPrompt);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Enhance Wardrobe ───────────────────────────────────────────────────

app.post('/api/enhance-wardrobe', async (req, res) => {
  const { characters, continuityPlan } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  try {
    const systemPrompt = `You are a costume designer. Based on the continuity plan, generate detailed outfit descriptions for every character in every scene. Always respond with valid JSON only.`;

    const charSummary = (characters?.characters || []).map((c: any) =>
      `- ${c.name}: default outfit = ${JSON.stringify(c.defaultOutfit)}`
    ).join('\n');

    const planSummary = (continuityPlan?.entries || []).map((e: any) =>
      `Scene ${e.sceneIndex} "${e.sceneTitle}": ${(e.characters || []).map((c: any) => `${c.name} wears "${c.outfit}" (changed: ${c.outfitChanged})`).join(', ')}`
    ).join('\n');

    const userPrompt = `Design detailed outfits for each character in each scene.

CHARACTERS:\n${charSummary}

CONTINUITY PLAN:\n${planSummary}

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

    const result = await claude.generateJSON(systemPrompt, userPrompt);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Regenerate Asset ───────────────────────────────────────────────────

app.post('/api/regenerate-asset', async (req, res) => {
  const { assetType, assetId, context, direction } = req.body as {
    assetType: string;
    assetId: string;
    context: Record<string, unknown>;
    direction?: string;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  const validTypes = ['character-ref', 'outfit', 'accessory', 'background'];
  if (!validTypes.includes(assetType)) {
    res.status(400).json({ error: `Invalid assetType: ${assetType}. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  try {
    const dirHint = direction ? `\nUser direction: "${direction}"` : '';

    const prompt = `You are regenerating a ${assetType} asset for a movie pre-production pipeline.

ASSET ID: ${assetId}
ASSET TYPE: ${assetType}

CONTEXT:
${JSON.stringify(context, null, 2)}
${dirHint}

Generate a fresh, detailed description for this ${assetType}. Return JSON with:
{
  "assetType": "${assetType}",
  "assetId": "${assetId}",
  "description": "detailed visual description suitable for AI image generation (100+ words)",
  "keyVisualElements": ["list of key visual elements"],
  "mood": "mood/atmosphere",
  "colorPalette": ["primary colors"],
  "notes": "any production notes"
}`;

    const result = await claude.generateJSON(
      `You are a pre-production asset designer for film. Return only valid JSON.`,
      prompt,
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Audio Design ───────────────────────────────────────────────────────

app.post('/api/audio-design', async (req, res) => {
  const { concept, scenes, continuityPlan } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in .env' });
    return;
  }

  try {
    const systemPrompt = `You are a film sound designer and music supervisor. Design the complete audio landscape for a movie: background music themes, per-scene music assignments, and sound effects. Music themes can span multiple scenes for continuity. Always respond with valid JSON only.`;

    const sceneSummary = (scenes || []).map((s: any, i: number) =>
      `Scene ${i}: "${s.title}" (${s.slugline || ''}) — ${s.emotionalTone || ''}, tension: ${s.tensionLevel || 5}/10, music mood: ${s.musicMood || 'none'}, duration: ${s.estimatedDurationSeconds || '?'}s`
    ).join('\n');

    const userPrompt = `Design the audio landscape for this production.

CONCEPT:
Logline: ${concept?.logline || ''}
Tone: ${concept?.tone || ''}
Visual Style: ${concept?.visualStyleRecommendation || ''}

SCENES:
${sceneSummary}

Design:
1. Global music themes that may span multiple scenes (main theme, tension theme, emotional theme, etc.)
2. Per-scene music assignments — which theme plays, whether it continues from previous scene, and the music action (start/continue/fade-in/fade-out/swell/stop/silence)
3. Per-scene sound effects with timing and generation prompts

Generate JSON:
{
  "globalThemes": [
    {
      "name": "theme name",
      "description": "description of the musical theme",
      "mood": "mood description",
      "tempo": "slow|moderate|fast",
      "genre": "musical genre",
      "instruments": ["instrument list"],
      "generationPrompt": "detailed prompt for AI music generation",
      "appliesTo": ["scene titles or 'all'"]
    }
  ],
  "sceneAudio": [
    {
      "sceneIndex": 0,
      "sceneTitle": "title",
      "musicTheme": "which global theme to use or 'none'",
      "musicAction": "start|continue|fade-in|fade-out|swell|drop|stop|silence",
      "musicMood": "specific mood for this scene",
      "musicContinuesFromPrev": false,
      "musicPrompt": "scene-specific music generation prompt",
      "musicEnabled": true,
      "sfxEnabled": true,
      "soundEffects": [
        {
          "name": "effect name",
          "description": "what the sound is",
          "triggerPoint": 0,
          "duration": 2,
          "volume": "background|subtle|normal|prominent|loud",
          "generationPrompt": "prompt for AI SFX generation"
        }
      ]
    }
  ]
}`;

    const result = await claude.generateJSON(systemPrompt, userPrompt);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ─── API: Image Generation (Gemini Nano Banana Pro) ─────────────────────────

app.post('/api/generate-image/character', async (req, res) => {
  const { name, appearance, defaultOutfit, style, referenceImage } = req.body;

  try {
    const g = getGemini();
    const result = await g.generateCharacterReference(
      { name, appearance: appearance || {}, defaultOutfit, referenceImage: referenceImage || undefined },
      style || 'cinematic'
    );
    res.json(result);
  } catch (err: unknown) {
    console.error('Character image error:', err);
    const message = err instanceof Error ? err.message : 'Image generation failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/generate-image/location', async (req, res) => {
  const { name, type, description, interior, lightingCondition, mood, colorScheme, keyFeatures, style, referenceImage } = req.body;

  try {
    const g = getGemini();
    const result = await g.generateLocationBackground(
      { name, type, description, interior, lightingCondition, mood, colorScheme, keyFeatures, referenceImage: referenceImage || undefined },
      style || 'cinematic'
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/generate-image/outfit', async (req, res) => {
  const { characterName, outfitName, outfitDescription, outfitDetails, style, characterAppearance, portraitRef } = req.body;

  try {
    const g = getGemini();
    const result = await g.generateOutfitImage(
      { characterName, outfitName, outfitDescription, outfitDetails, characterAppearance, portraitRef },
      style || 'cinematic'
    );
    res.json(result);
  } catch (err: unknown) {
    console.error('Outfit generation error:', err);
    const message = err instanceof Error ? err.message : 'Image generation failed';
    res.status(500).json({ error: message });
  }
});

// ─── API: Compose character for scene (multi-image input) ───────────────────

app.post('/api/generate-image/compose-character', async (req, res) => {
  const { characterName, portraitRef, outfitRef, accessoryRefs, sceneContext, pose, style } = req.body;

  if (!portraitRef?.base64) {
    res.status(400).json({ error: 'portraitRef with base64 is required' });
    return;
  }

  try {
    const g = getGemini();
    const result = await g.composeCharacterForScene({
      characterName,
      portraitRef,
      outfitRef: outfitRef || undefined,
      accessoryRefs: accessoryRefs || [],
      sceneContext: sceneContext || { title: '', locationName: '', timeOfDay: '', emotionalState: '', action: '' },
      pose: pose || 'standing naturally',
    }, style || 'cinematic');
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Character composition failed';
    res.status(500).json({ error: message });
  }
});

// ─── API: Generate shot frame (composed characters + background) ────────────

app.post('/api/generate-image/shot-frame', async (req, res) => {
  const { frame, references, style } = req.body;

  if (!frame) {
    res.status(400).json({ error: 'frame object is required' });
    return;
  }

  try {
    const g = getGemini();
    const result = await g.generateShotFrame(
      {
        description: frame.description || '',
        backgroundDescription: frame.backgroundDescription || '',
        characters: frame.characters || [],
        cameraAngle: frame.cameraAngle || 'eye level',
        shotSize: frame.shotSize || 'medium',
      },
      {
        composedCharacters: references?.composedCharacters || [],
        locationBackground: references?.locationBackground || undefined,
        continuityFrame: references?.continuityFrame || undefined,
      },
      style || 'cinematic'
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Shot frame generation failed';
    res.status(500).json({ error: message });
  }
});

// ─── API: Veo 3.1 Video Generation ──────────────────────────────────────────

interface VideoJob {
  operation: unknown;
  status: 'generating' | 'done' | 'error';
  videoUrl?: string;
  error?: string;
  startTime: number;
}
const videoJobs = new Map<string, VideoJob>();

// Start video generation for a shot
app.post('/api/generate-video/shot', async (req, res) => {
  const { prompt, firstFrame, lastFrame, referenceImages, aspectRatio, resolution } = req.body;

  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const g = getGemini();
    const operation = await g.startShotVideo({
      prompt,
      firstFrame: firstFrame || undefined,
      lastFrame: lastFrame || undefined,
      referenceImages: referenceImages || [],
      aspectRatio: aspectRatio || '16:9',
      resolution: resolution || '720p',
    });

    const jobId = randomUUID();
    videoJobs.set(jobId, {
      operation,
      status: 'generating',
      startTime: Date.now(),
    });

    res.json({ jobId });
  } catch (err: unknown) {
    console.error('Video generation start error:', err);
    const message = err instanceof Error ? err.message : 'Video generation start failed';
    res.status(500).json({ error: message });
  }
});

// Poll video generation status
app.get('/api/generate-video/status/:jobId', async (req, res) => {
  const job = videoJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'done') {
    res.json({ status: 'done', videoUrl: job.videoUrl });
    return;
  }
  if (job.status === 'error') {
    res.json({ status: 'error', error: job.error });
    return;
  }

  try {
    const g = getGemini();
    const updated = await g.checkVideoStatus(job.operation);
    job.operation = updated;

    if ((updated as any).done) {
      // Download video to generated directory
      const filename = `shot-${req.params.jobId}.mp4`;
      const filePath = join(GENERATED_DIR, filename);
      await g.downloadVideo(updated, filePath);

      job.status = 'done';
      job.videoUrl = `/generated/videos/${filename}`;
      res.json({ status: 'done', videoUrl: job.videoUrl });
    } else {
      const elapsed = Math.round((Date.now() - job.startTime) / 1000);
      res.json({ status: 'generating', elapsedSeconds: elapsed });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Status check failed';
    job.status = 'error';
    job.error = message;
    res.json({ status: 'error', error: message });
  }
});

// ─── API: Production plan (format → shot/scene budget) ──────────────────────

app.get('/api/plan/:format', (req, res) => {
  try {
    const plan = buildProductionPlan(req.params.format);
    res.json(plan);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown format';
    res.status(400).json({ error: message });
  }
});

app.get('/api/formats', (_req, res) => {
  const formats = Object.entries(FORMAT_SPECS).map(([id, spec]) => ({
    id,
    label: spec.label,
    durationSeconds: spec.defaultDuration,
    description: spec.description,
  }));
  res.json(formats);
});

// ─── API: Health check ──────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    hasGeminiKey: !!(process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY),
  });
});

// ─── SPA fallback ───────────────────────────────────────────────────────────

app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🎬 AI Movie Maker running at http://localhost:${PORT}\n`);
});

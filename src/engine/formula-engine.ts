// ============================================================================
// FORMULA ENGINE
// Takes initial user input (or AI-generated concept) and produces a complete
// structured project by applying genre-specific formula templates.
// ============================================================================

import type {
  Project, Genre, ProjectFormat, AutomationLevel,
  FormulaTemplate, FormulaBeat, Act, Sequence, Scene, Shot,
  Character, Location, MusicTheme, EmotionalTone, TimeOfDay,
  FrameSpec, CameraSpec, ShotSize, CameraAngle, SceneCharacter,
  DialogueLine, SoundEffect, VideoGenerationSpec,
} from '../types';

// ─── INITIAL INPUT (what the user provides to start) ─────────────────────────

export interface InitialInput {
  // Required (user provides OR AI generates)
  title: string;
  genre: Genre;
  format: ProjectFormat;

  // Optional — AI fills these if not provided
  logline?: string;
  mainPlot?: string;
  setting?: string;
  timePeriod?: string;
  tone?: string;                   // e.g., "dark and gritty", "lighthearted", "satirical"

  // Characters — user can describe or let AI generate
  protagonistDescription?: string;
  antagonistDescription?: string;
  supportingCharacters?: string[];

  // Key story moments — user can define major milestones
  keyMilestones?: StoryMilestone[];

  // Ending — knowing the ending helps plan everything backward
  intendedEnding?: string;

  // Preferences
  targetDuration?: number;         // minutes
  automationLevel: AutomationLevel;
  kidMode?: boolean;
  kidAgeRange?: 'toddler' | 'kids' | 'tweens';
  visualStyle?: string;

  // Series-specific
  numberOfEpisodes?: number;
  episodeDuration?: number;
}

export interface StoryMilestone {
  order: number;
  description: string;
  type: 'setup' | 'turning-point' | 'climax' | 'resolution' | 'twist' | 'revelation';
  involvedCharacters?: string[];
}

// ─── GENERATION PHASES ───────────────────────────────────────────────────────
// The engine works in phases, each building on the previous.
// At each phase, the user can review/modify or let AI auto-approve.

export enum GenerationPhase {
  CONCEPT = 'concept',              // Logline, genre, basic idea
  MILESTONES = 'milestones',        // Major story beats / turning points
  CHARACTERS = 'characters',        // Character design & backstories
  LOCATIONS = 'locations',          // Location design & references
  STRUCTURE = 'structure',          // Acts, sequences, scene breakdown
  SCENES = 'scenes',               // Detailed scene descriptions
  SHOTS = 'shots',                  // Shot-by-shot with first/last frames
  DIALOGUE = 'dialogue',           // All dialogue lines
  MUSIC = 'music',                 // Music themes & placement
  SOUND = 'sound',                 // Sound effects & ambient
  GENERATION = 'generation',       // AI generation of all assets
  ASSEMBLY = 'assembly',           // Final assembly
}

// ─── AI PROMPT TEMPLATES ─────────────────────────────────────────────────────
// These prompts are sent to Claude to generate each phase.

export const AI_PROMPTS = {

  // Phase 1: Generate or refine the concept
  CONCEPT: `You are an expert screenwriter and film producer. Given the following initial input, create a compelling movie/show concept.

INPUT:
{{input}}

Generate:
1. A polished logline (1-2 sentences that sell the concept)
2. A detailed synopsis (3-5 paragraphs covering the full story arc)
3. The central theme (what truth does this story explore?)
4. The tone and visual style recommendation
5. Target audience analysis

Format your response as JSON matching this structure:
{
  "logline": "...",
  "synopsis": "...",
  "theme": "...",
  "tone": "...",
  "visualStyleRecommendation": "...",
  "targetAudience": "..."
}`,

  // Phase 2: Generate story milestones
  MILESTONES: `You are an expert screenwriter. Given this concept and the {{formulaName}} story structure, create the major story milestones.

CONCEPT:
{{concept}}

FORMULA BEATS:
{{formulaBeats}}

INTENDED ENDING (if provided):
{{ending}}

Generate milestones that:
1. Follow the formula's beat structure exactly
2. Work BACKWARD from the ending (if provided) to ensure everything builds toward it
3. Each milestone maps to a specific formula beat
4. Include the emotional state and stakes at each point
5. Ensure cause-and-effect between milestones (each one logically leads to the next)

For EACH milestone provide:
{
  "beatId": "formula beat ID this maps to",
  "title": "short title",
  "description": "2-3 sentences describing what happens",
  "emotionalTone": "the feeling",
  "characters": ["who is involved"],
  "location": "where it happens",
  "stakes": "what's at risk",
  "causedBy": "which previous milestone leads to this",
  "leadsTo": "which next milestone this causes"
}`,

  // Phase 3: Generate characters
  CHARACTERS: `You are an expert character designer for film. Given this story concept and milestones, design the characters.

CONCEPT: {{concept}}
MILESTONES: {{milestones}}
GENRE: {{genre}}
VISUAL STYLE: {{visualStyle}}

Characters do NOT have to be human. They can be animals, robots, aliens, monsters, mythical creatures, anthropomorphic objects, abstract beings — ANYTHING the story calls for. Adapt the appearance fields accordingly.

For EACH character generate a complete character profile:
{
  "name": "full name or title",
  "type": "human|animal|robot|alien|creature|mythical|anthropomorphic|object|abstract|other",
  "species": "specific species/kind if non-human (e.g. golden retriever, battle droid, dragon)",
  "role": "hero|mentor|ally|love-interest|sidekick|antagonist|...",
  "importance": "protagonist|deuteragonist|supporting|minor",
  "personality": "3-5 sentences describing personality",
  "appearance": {
    "age": "number or description (e.g. 'ancient', 'newborn', 'ageless')",
    "gender": "... or 'none' for genderless beings",
    "ethnicity": "... or omit for non-human",
    "height": "short|average|tall|massive|tiny|...",
    "build": "slim|average|athletic|bulky|...",
    "skinTone": "skin/fur/scales/metal color and texture",
    "hairColor": "... or 'none' if no hair (fur color, feathers, etc.)",
    "hairStyle": "... or describe fur/feathers/surface texture",
    "hairLength": "short|medium|long|none",
    "eyeColor": "...",
    "facialHair": "...",
    "bodyDescription": "full visual description — especially important for non-human characters (e.g. 'sleek chrome chassis with glowing blue joints', 'fluffy orange tabby cat with white paws')",
    "distinctiveFeatures": ["specific memorable features — tail, wings, antenna, glowing marks, etc."]
  },
  "defaultOutfit": {
    "top": { "type": "...", "color": "...", "material": "..." },
    "bottom": { "type": "...", "color": "..." },
    "footwear": { "type": "...", "color": "..." }
  },
  "accessories": [{ "type": "...", "name": "...", "description": "...", "wornWhen": "always|usually|sometimes" }],
  "voice": {
    "pitch": "low|medium|high",
    "tone": "warm|cold|raspy|smooth|...",
    "accent": "...",
    "speakingSpeed": "slow|normal|fast"
  },
  "speechPattern": "how they talk — formal, slang, technical, etc.",
  "mannerisms": ["habitual gestures or behaviors"],
  "arc": "brief description of their character arc across the story"
}

IMPORTANT: Be extremely specific about visual details. Every detail you specify will be used to generate consistent AI images across hundreds of scenes. Vague descriptions = inconsistent characters. For non-human characters, the "bodyDescription" field is CRITICAL — describe the full physical form in vivid detail.`,

  // Phase 4: Generate locations
  LOCATIONS: `You are a production designer for film. Design all locations needed for this story.

CONCEPT: {{concept}}
MILESTONES: {{milestones}}
CHARACTERS: {{characters}}

For EACH location generate:
{
  "name": "location name",
  "type": "home-interior|office|street|park|...",
  "description": "detailed visual description for AI image generation",
  "interior": true/false,
  "dimensions": "size description",
  "colorScheme": ["hex colors defining the palette"],
  "keyFeatures": ["notable visual elements"],
  "furnitureAndProps": ["specific items in the space"],
  "lightingCondition": "natural-daylight|fluorescent|...",
  "mood": "the feeling this place evokes",
  "usedInMilestones": ["which milestones happen here"]
}

IMPORTANT: Be extremely specific. These descriptions will generate panoramic reference images that must remain consistent across all scenes set here.`,

  // Phase 5: Break milestones into scenes
  SCENES: `You are an expert screenwriter AND cinematographer breaking down a story into individual scenes. You think like a master director — every scene has a visual language, a camera personality, and deliberate lighting/color choices that serve the story.

CONCEPT: {{concept}}
MILESTONES: {{milestones}}
CHARACTERS: {{characters}}
LOCATIONS: {{locations}}
FORMULA: {{formula}}
PREVIOUS SCENES: {{previousScenes}}
NEXT MILESTONE: {{nextMilestone}}
ENDING: {{ending}}
VISUAL STYLE: {{visualStyle}}

Generate scenes that fill the gap between the previous scenes and the next milestone.

For EACH scene:
1. Consider what ALREADY happened (previousScenes) — maintain continuity
2. Consider where we NEED TO GET (nextMilestone) — build toward it
3. Consider the ENDING — plant seeds that will pay off later
4. Track character clothing — if a character was wearing X in the last scene and no time has passed, they're still wearing X
5. THINK LIKE A DIRECTOR — plan the visual storytelling: how should light, color, and camera convey what words cannot?

🎬 CINEMATOGRAPHY DIRECTION — for each scene, design the visual approach:
- LIGHTING: Be specific — "warm golden hour side-light casting long shadows" not just "natural"
- COLOR MOOD: Describe the palette emotionally — "desaturated cool blues with one warm accent" or "oversaturated tropical greens and pinks"
- VISUAL MOTIF: Recurring visual element that reinforces the scene's theme — reflections, shadows, framing through doorways, shallow focus isolating characters, symmetry vs asymmetry
- KEY SHOTS: Plan 3-5 specific shots a great director would demand — at least ONE extreme close-up (eyes, hands, mouth), at least ONE insert/detail shot (an object that tells the story — a half-empty glass, a ticking clock, a crumpled letter, rain on a window), and at least ONE wide establishing shot
- CAMERA PERSONALITY: How does the camera behave? "Restless handheld, always moving" vs "locked-off, voyeuristic distance" vs "slow creeping dolly, building dread"

For EACH scene generate:
{
  "title": "short scene title",
  "slugline": "INT./EXT. LOCATION - TIME",
  "description": "what happens in this scene",
  "purpose": "why this scene exists narratively",
  "locationId": "which location",
  "timeOfDay": "morning|afternoon|evening|night|...",
  "charactersPresent": [
    {
      "characterId": "...",
      "outfitId": "which outfit (same as last scene if continuous)",
      "emotionalState": "their emotional state",
      "action": "what they're doing",
      "continuityFromPrevScene": true/false
    }
  ],
  "events": [
    { "order": 1, "type": "action|dialogue|reaction|revelation", "description": "..." }
  ],
  "dialogue": [
    { "order": 1, "characterId": "...", "text": "...", "emotion": "...", "parenthetical": "..." }
  ],
  "cinematography": {
    "lightingDirection": "specific lighting setup — e.g. low-key side lighting with harsh shadows, warm practicals only, cold overhead fluorescents",
    "colorMood": "emotional color description — e.g. desaturated cool blues with warm accent highlights, monochromatic earth tones, high-contrast neon",
    "visualMotif": "recurring visual element — e.g. characters framed through doorways (trapped), reflections in glass (duality), shallow focus (isolation)",
    "keyShots": ["extreme close-up of hands trembling on table", "wide shot showing character alone in vast empty room", "insert: clock on wall showing 3 AM", "over-the-shoulder revealing what character sees", "low angle looking up at character — power shift"],
    "cameraPersonality": "how the camera behaves — e.g. slow deliberate movements with voyeuristic distance, restless handheld energy, smooth steadicam circling"
  },
  "tensionLevel": 0-10,
  "emotionalTone": "...",
  "estimatedDurationSeconds": number (must be a multiple of 8 — each shot is 8 seconds),
  "transitionIn": "cut|fade-in|dissolve|...",
  "transitionOut": "cut|fade-out|smash-cut|...",
  "musicMood": "none|subtle-underscore|building-tension|..."
}`,

  // Phase 6: Break scenes into shots with first/last frame specs
  SHOTS: `You are a WORLD-CLASS CINEMATOGRAPHER — think Roger Deakins, Emmanuel Lubezki, Hoyte van Hoytema. You don't just "cover" a scene, you TELL THE STORY WITH THE CAMERA. Every shot choice, angle, and movement carries emotional meaning.

SCENE: {{scene}}
CHARACTERS: {{characters}}
LOCATION: {{location}}
VISUAL STYLE: {{visualStyle}}
PREVIOUS SHOT: {{previousShot}}
CINEMATOGRAPHY DIRECTION: {{cinematography}}

Break this scene into individual shots. For EACH shot, specify the FIRST FRAME and LAST FRAME that an AI video generator will interpolate between.

🎬 MASTER DIRECTOR'S SHOT VOCABULARY — you MUST use variety from this list:

SHOT SIZES (use ALL of these across scenes, not just medium):
- EXTREME WIDE: Tiny figure in vast landscape — isolation, scale, epic scope
- WIDE/ESTABLISHING: Full environment with characters — context, geography
- MEDIUM WIDE (cowboy): Waist-up — walking, gesturing, body language
- MEDIUM: Chest-up — standard conversation coverage
- MEDIUM CLOSE-UP: Shoulders-up — intimate conversation
- CLOSE-UP: Face fills frame — emotion, reaction, intensity
- EXTREME CLOSE-UP: Single feature (eyes, lips, hands, an object) — maximum intensity, detail
- INSERT/DETAIL: An object or environmental detail that tells the story — a clock, a letter, a photograph, a weapon, food, a wound, rain on glass

CAMERA ANGLES (use these to convey MEANING):
- EYE LEVEL: Neutral, equals
- LOW ANGLE (looking up): Power, dominance, heroism, threat
- HIGH ANGLE (looking down): Vulnerability, smallness, being watched
- DUTCH/CANTED: Unease, instability, psychological distortion
- BIRD'S EYE/OVERHEAD: God-like perspective, patterns, entrapment
- OVER-THE-SHOULDER: Connection, conversation, POV proximity
- POV (point of view): We ARE the character — maximum empathy/tension

CAMERA MOVEMENTS:
- STATIC/LOCKED: Tension, observation, formality
- PAN: Revealing information, following action
- TILT: Revealing scale (up = awe, down = despair)
- DOLLY IN: Increasing intimacy, realization, dread
- DOLLY OUT: Isolation, abandonment, revelation of context
- TRACKING/FOLLOW: Energy, pursuit, alongside character
- CRANE/JIB: Grand reveals, transitions, establishing scope
- STEADICAM/GIMBAL: Dreamlike flowing movement, following characters through spaces
- HANDHELD: Urgency, chaos, documentary realism, anxiety
- WHIP PAN: Surprise, speed, disorientation

🎬 MANDATORY SHOT VARIETY — for EVERY scene you MUST include:
1. At least ONE extreme close-up or close-up of a face, hands, or eyes (emotional anchor)
2. At least ONE insert/detail shot of an OBJECT or ENVIRONMENTAL ELEMENT that tells the story (a half-empty coffee cup, fingerprints on a window, a wilting flower, a phone screen, car keys on a table)
3. At least ONE wide or establishing shot showing the character in their environment
4. VARY your angles — NOT every shot should be eye-level. Use low angles for power, high angles for vulnerability, OTS for conversation intimacy
5. VARY your camera movement — mix static holds (for tension) with movement (for energy). A lingering static close-up after a fast tracking shot creates powerful rhythm

🎭 ENVIRONMENTAL STORYTELLING — show objects/details that reveal:
- Character state: an unmade bed = chaos, a perfectly organized desk = control, trembling hands = fear
- Passage of time: melting ice in a glass, a burning-down cigarette, changing light through a window
- Subtext: a wedding ring being twisted, a door left ajar, eyes glancing at an exit
- Atmosphere: dust motes in light beams, steam rising from coffee, condensation on a cold glass

🎵 SHOT RHYTHM — alternate between:
- FAST: Quick cuts between reaction close-ups during tense dialogue
- SLOW: Lingering wide shots or slow dolly-ins during emotional beats
- BREATHING ROOM: Hold on an empty space or environmental detail between intense character moments

Follow the CINEMATOGRAPHY DIRECTION from the scene if provided — the director has already specified the lighting feel, color mood, visual motif, key shots, and camera personality. Your job is to execute that vision shot-by-shot.

For EACH shot generate:
{
  "description": "what happens in this shot",
  "durationSeconds": 8,  // MUST be exactly 8 — matches Veo 3.1 clip length
  "camera": {
    "movement": "static|pan-left|dolly-in|tracking-right|crane-up|handheld|steadicam|whip-pan|...",
    "startAngle": "eye-level|low-angle|high-angle|over-the-shoulder|dutch-angle|birds-eye|pov|...",
    "endAngle": "...",
    "startSize": "extreme-wide|wide|medium-wide|medium|medium-close-up|close-up|extreme-close-up|insert|...",
    "endSize": "...",
    "speed": "slow|normal|fast",
    "stabilization": "locked|smooth|handheld"
  },
  "firstFrame": {
    "description": "Complete description of the first frame (50+ words). Include EVERYTHING visible — lighting quality, color temperature, atmosphere, textures, environmental details.",
    "backgroundDescription": "what's behind the subjects — include atmospheric details (haze, light shafts, reflections, weather)",
    "characters": [
      {
        "characterId": "...",
        "pose": "specific body pose",
        "expression": "specific facial expression",
        "position": { "placement": "left|center|right", "depth": "foreground|midground|background" },
        "action": "what they're physically doing"
      }
    ],
    "cameraAngle": "...",
    "shotSize": "...",
    "focusPoint": "what the camera focuses on",
    "depthOfField": "shallow|normal|deep"
  },
  "lastFrame": {
    "description": "Complete description of the last frame (50+ words). Show how things CHANGED from the first frame.",
    "backgroundDescription": "...",
    "characters": [
      {
        "characterId": "...",
        "pose": "how their pose changed",
        "expression": "how their expression changed",
        "position": { "placement": "...", "depth": "..." },
        "action": "..."
      }
    ],
    "cameraAngle": "...",
    "shotSize": "...",
    "focusPoint": "...",
    "depthOfField": "..."
  },
  "dialogueInShot": ["lines of dialogue spoken during this shot"],
  "soundEffects": ["sound effects during this shot"]
}

RULES:
- EVERY shot is exactly 8 seconds long (the AI video generator produces fixed 8s clips). Scope each shot's action to fit naturally within 8 seconds — no more, no less.
- If an action takes longer than 8 seconds, split it across multiple consecutive shots with matching first/last frames for continuity.
- First shot of a scene should be an establishing shot (wide) unless the scene requires a dramatic start
- NOT EVERY SHOT IS MEDIUM EYE-LEVEL — this is the hallmark of amateur cinematography. Vary your shot sizes from extreme-wide to extreme-close-up. Vary your angles. Vary your movement.
- INCLUDE INSERT SHOTS — a great film shows the OBJECTS that tell the story. A ticking clock. A phone buzzing face-down. Fingers drumming on a table. Rain streaking down a window.
- Emotional moments need EXTREME close-ups — fill the frame with the face, show every micro-expression
- Action needs wider shots with dynamic camera movement
- The LAST FRAME of one shot should be composable with the FIRST FRAME of the next shot
- Character positions must be spatially consistent within the scene
- Include specific outfit and accessory details for EVERY character in EVERY frame
- DESCRIBE LIGHTING in every frame — warm/cool color temperature, direction, quality (hard/soft), practical sources`,

  // Guard prompts for kid mode
  KID_MODE_GUARD: `You are a child content safety reviewer. Review the following content for a {{ageRange}} audience.

CONTENT:
{{content}}

Check for:
1. Violence or scary content
2. Inappropriate language
3. Complex themes children wouldn't understand
4. Anything that could be frightening
5. Romantic or sexual content
6. Drug or alcohol references

If ANY issues found, rewrite the content to be appropriate while keeping the story engaging.

Return:
{
  "safe": true/false,
  "issues": ["list of issues found"],
  "rewrittenContent": "safe version if needed"
}`,
};

// ─── FORMULA ENGINE CORE ─────────────────────────────────────────────────────

export class FormulaEngine {

  /**
   * Main entry point: takes initial input and produces a complete project structure.
   * Works in phases, each building on the previous.
   */
  async generateProject(input: InitialInput): Promise<Project> {
    // This is the orchestration logic. In a real implementation,
    // each step calls Claude API with the appropriate prompt.

    const steps: GenerationStep[] = [
      { phase: GenerationPhase.CONCEPT,     prompt: AI_PROMPTS.CONCEPT },
      { phase: GenerationPhase.MILESTONES,  prompt: AI_PROMPTS.MILESTONES },
      { phase: GenerationPhase.CHARACTERS,  prompt: AI_PROMPTS.CHARACTERS },
      { phase: GenerationPhase.LOCATIONS,   prompt: AI_PROMPTS.LOCATIONS },
      { phase: GenerationPhase.SCENES,      prompt: AI_PROMPTS.SCENES },
      { phase: GenerationPhase.SHOTS,       prompt: AI_PROMPTS.SHOTS },
      { phase: GenerationPhase.DIALOGUE,    prompt: AI_PROMPTS.SCENES },   // dialogue is part of scenes
      { phase: GenerationPhase.MUSIC,       prompt: '' },                   // uses music routing
      { phase: GenerationPhase.SOUND,       prompt: '' },                   // uses SFX routing
    ];

    // The key insight: we generate TOP-DOWN
    // 1. Milestones first (the skeleton)
    // 2. Fill in between milestones with scenes
    // 3. Break scenes into shots
    // 4. Generate first/last frames for each shot

    // At each step, the AI considers:
    // - What already happened (all previous scenes)
    // - Where we need to get (next milestone)
    // - The ending (to plant seeds and maintain consistency)
    // - The formula's beat requirements (tension level, emotional tone, pacing)

    throw new Error('Not implemented — see generateProjectStub for the data structure');
  }

  /**
   * Loads a formula template by ID
   */
  async loadFormula(formulaId: string): Promise<FormulaTemplate> {
    // In production: load from src/formulas/{formulaId}.json
    throw new Error(`Load formula: ${formulaId}`);
  }

  /**
   * Selects the best formula template for the given genre + format combo
   */
  selectFormula(genre: Genre, format: ProjectFormat): string {
    const formulaMap: Record<string, Record<string, string>> = {
      'feature-film': {
        'comedy': 'comedy-feature',
        'drama': 'three-act-drama',
        'horror': 'horror-feature',
        'thriller': 'horror-feature',
        'romance': 'romance-feature',
        'action': 'action-feature',
        'sci-fi': 'three-act-drama',
        'fantasy': 'three-act-drama',
        'mystery': 'mystery-feature',
        'crime': 'mystery-feature',
        'animation': 'three-act-drama',
        'adventure': 'three-act-drama',
      },
      'tv-series': {
        'drama': 'tv-series-drama-streaming',
        'comedy': 'tv-sitcom-streaming',
        'horror': 'tv-series-drama-streaming',
        'thriller': 'tv-series-drama-streaming',
        'sci-fi': 'tv-series-drama-streaming',
        'fantasy': 'tv-series-drama-streaming',
        'mystery': 'tv-series-drama-streaming',
        'crime': 'tv-series-drama-streaming',
      },
      'short-film': {
        'default': 'short-film-structure',
      },
      'ad-commercial': {
        'default': 'commercial-30sec',
      },
    };

    const formatMap = formulaMap[format] || formulaMap['feature-film'];
    return formatMap[genre] || formatMap['default'] || 'three-act-drama';
  }

  /**
   * Calculates target duration for each beat based on total runtime
   */
  calculateBeatDurations(formula: FormulaTemplate, totalMinutes: number): BeatDuration[] {
    const totalSeconds = totalMinutes * 60;
    return formula.beats.map(beat => ({
      beatId: beat.id,
      beatName: beat.name,
      startSeconds: Math.round((beat.runtimePercentStart / 100) * totalSeconds),
      endSeconds: Math.round((beat.runtimePercentEnd / 100) * totalSeconds),
      durationSeconds: Math.round((beat.durationPercent / 100) * totalSeconds),
      suggestedScenes: beat.suggestedSceneCount,
    }));
  }

  /**
   * Validates scene sequence for continuity errors
   */
  validateContinuity(scenes: Scene[]): ContinuityIssue[] {
    const issues: ContinuityIssue[] = [];

    for (let i = 1; i < scenes.length; i++) {
      const prev = scenes[i - 1];
      const curr = scenes[i];

      // Check character outfit continuity
      for (const char of curr.charactersPresent) {
        if (char.continuityFromPrevScene) {
          const prevChar = prev.charactersPresent.find(c => c.characterId === char.characterId);
          if (prevChar && prevChar.outfitId !== char.outfitId) {
            issues.push({
              type: 'outfit-mismatch',
              sceneId: curr.id,
              characterId: char.characterId,
              message: `Character outfit changed between scenes ${prev.number} and ${curr.number} but continuityFromPrevScene is true`,
            });
          }
        }
      }

      // Check time-of-day continuity
      if (!curr.elapsedTimeSincePrevious && curr.timeOfDay !== prev.timeOfDay) {
        issues.push({
          type: 'time-inconsistency',
          sceneId: curr.id,
          message: `Time of day changed from ${prev.timeOfDay} to ${curr.timeOfDay} without elapsed time specified`,
        });
      }

      // Check tension curve follows formula
      if (Math.abs(curr.tensionLevel - prev.tensionLevel) > 5) {
        issues.push({
          type: 'tension-jump',
          sceneId: curr.id,
          message: `Tension jumped from ${prev.tensionLevel} to ${curr.tensionLevel} — consider adding a transition scene`,
        });
      }
    }

    return issues;
  }

  /**
   * Builds the image generation prompt for a frame, incorporating character
   * references, location details, and style constraints.
   */
  buildFramePrompt(
    frame: FrameSpec,
    characters: Character[],
    location: Location,
    style: string,
    kidMode: boolean
  ): string {
    let prompt = '';

    // Kid mode prefix
    if (kidMode) {
      prompt += 'child-friendly, colorful, safe for kids, no violence, no scary elements, bright and cheerful, ';
    }

    // Style
    prompt += `${style} style, `;

    // Shot composition
    prompt += `${frame.shotSize} shot, ${frame.cameraAngle}, `;
    prompt += `depth of field: ${frame.depthOfField}, `;

    // Location/background
    prompt += `Background: ${frame.backgroundDescription}. `;
    prompt += `Setting: ${location.description}. `;
    prompt += `Lighting: ${location.lightingCondition}. `;

    // Characters
    for (const frameChar of frame.characters) {
      const charDef = characters.find(c => c.id === frameChar.characterId);
      if (!charDef) continue;

      const app = charDef.appearance;
      prompt += `Character "${charDef.name}": `;
      prompt += `${app.age}-year-old ${app.gender}, ${app.ethnicity}, `;
      prompt += `${app.build} build, ${app.height} height, `;
      prompt += `${app.skinTone} skin, ${app.hairColor} ${app.hairLength} ${app.hairStyle} hair, `;
      prompt += `${app.eyeColor} eyes. `;

      if (app.distinctiveFeatures.length > 0) {
        prompt += `Distinctive: ${app.distinctiveFeatures.join(', ')}. `;
      }

      // Outfit
      const outfit = charDef.outfits.find(o => o.id === frameChar.outfitId) || charDef.defaultOutfit;
      if (outfit) {
        prompt += `Wearing: ${outfit.top.color} ${outfit.top.type}`;
        if (outfit.top.material) prompt += ` (${outfit.top.material})`;
        prompt += `, ${outfit.bottom.color} ${outfit.bottom.type}`;
        prompt += `, ${outfit.footwear.color} ${outfit.footwear.type}. `;
      }

      // Accessories
      const activeAccessories = charDef.accessories.filter(
        a => frameChar.accessoryIds.includes(a.name)
      );
      if (activeAccessories.length > 0) {
        prompt += `Accessories: ${activeAccessories.map(a => a.description).join(', ')}. `;
      }

      // Pose and expression
      prompt += `Pose: ${frameChar.pose}. `;
      prompt += `Expression: ${frameChar.expression}. `;
      prompt += `Position: ${frameChar.position.placement} ${frameChar.position.depth}. `;
      prompt += `Action: ${frameChar.action}. `;
    }

    // Focus
    prompt += `Focus on: ${frame.focusPoint}. `;

    return prompt.trim();
  }
}

// ─── SUPPORTING TYPES ────────────────────────────────────────────────────────

interface GenerationStep {
  phase: GenerationPhase;
  prompt: string;
}

interface BeatDuration {
  beatId: string;
  beatName: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  suggestedScenes: { min: number; max: number };
}

interface ContinuityIssue {
  type: 'outfit-mismatch' | 'time-inconsistency' | 'tension-jump' | 'location-error' | 'character-missing';
  sceneId: string;
  characterId?: string;
  message: string;
}

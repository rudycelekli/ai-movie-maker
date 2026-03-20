// ============================================================================
// AI MOVIE MAKER - COMPLETE TYPE SYSTEM
// The data model for formula-driven, AI-automated movie/TV production
// ============================================================================

// ─── PROJECT ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  title: string;
  logline: string;
  genre: Genre;
  subGenres: Genre[];
  format: ProjectFormat;
  targetDuration: number;            // minutes
  targetAudience: AudienceRating;
  style: GlobalStyle;
  formula: FormulaSelection;
  characters: Character[];
  locations: Location[];
  props: Prop[];
  musicThemes: MusicTheme[];
  acts: Act[];
  pipeline: PipelineConfig;
  automationLevel: AutomationLevel;
  status: ProjectStatus;
  metadata: ProjectMetadata;
}

export type Genre =
  | 'comedy' | 'drama' | 'horror' | 'thriller' | 'romance'
  | 'action' | 'sci-fi' | 'fantasy' | 'mystery' | 'crime'
  | 'animation' | 'documentary' | 'musical' | 'western'
  | 'war' | 'sports' | 'family' | 'adventure';

export type ProjectFormat = 'feature-film' | 'short-film' | 'tv-episode' | 'tv-series' | 'mini-series' | 'web-series' | 'ad-commercial';

export type AudienceRating = 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17' | 'TV-Y' | 'TV-PG' | 'TV-14' | 'TV-MA';

export type AutomationLevel = 'full-auto' | 'semi-auto' | 'manual';

export type ProjectStatus = 'concept' | 'pre-production' | 'in-production' | 'post-production' | 'complete';

export interface ProjectMetadata {
  createdAt: string;
  updatedAt: string;
  version: number;
  createdBy: string;
  estimatedCost?: CostEstimate;
}

export interface CostEstimate {
  imageGeneration: number;
  videoGeneration: number;
  voiceGeneration: number;
  musicGeneration: number;
  soundEffects: number;
  total: number;
  currency: string;
}

// ─── GLOBAL STYLE ────────────────────────────────────────────────────────────

export interface GlobalStyle {
  visualStyle: VisualStyle;
  colorPalette: ColorPalette;
  lightingPreset: LightingPreset;
  cameraStyle: CameraStyle;
  aspectRatio: AspectRatio;
  resolution: Resolution;
}

export type VisualStyle =
  | 'photorealistic' | 'cinematic' | 'anime' | 'cartoon'
  | 'watercolor' | 'oil-painting' | 'noir' | 'retro'
  | 'minimalist' | 'surreal' | 'comic-book' | 'claymation'
  | 'pixel-art' | 'sketch' | 'custom';

export interface ColorPalette {
  primary: string[];           // hex colors
  accent: string[];
  mood: 'warm' | 'cool' | 'neutral' | 'muted' | 'vibrant' | 'pastel' | 'dark' | 'neon';
  customDescription?: string;
}

export type LightingPreset =
  | 'natural-daylight' | 'golden-hour' | 'blue-hour' | 'overcast'
  | 'studio-three-point' | 'dramatic-chiaroscuro' | 'neon-noir'
  | 'candlelight' | 'moonlight' | 'fluorescent' | 'custom';

export type CameraStyle = 'handheld' | 'steadicam' | 'tripod' | 'drone' | 'mixed';

export type AspectRatio = '16:9' | '21:9' | '4:3' | '1:1' | '9:16' | '2.39:1';

export type Resolution = '720p' | '1080p' | '2K' | '4K';

// ─── FORMULA / TEMPLATE SYSTEM ──────────────────────────────────────────────

export interface FormulaSelection {
  templateId: string;              // e.g., 'save-the-cat-comedy'
  templateName: string;
  baseStructure: StructureType;
  genreOverlay: Genre;
  customizations: FormulaCustomization[];
}

export type StructureType =
  | 'three-act' | 'save-the-cat' | 'heros-journey' | 'story-circle'
  | 'sequence-approach' | 'five-act' | 'tv-cold-open'
  | 'sitcom-22min' | 'drama-44min' | 'streaming-flexible';

export interface FormulaCustomization {
  beatId: string;
  override: Partial<FormulaBeat>;
}

export interface FormulaTemplate {
  id: string;
  name: string;
  description: string;
  genre: Genre;
  format: ProjectFormat;
  baseStructure: StructureType;
  totalBeats: number;
  beats: FormulaBeat[];
  pacingProfile: PacingProfile;
  genreRules: GenreRule[];
  plotStructure: PlotStructure;
  characterArcTemplate: CharacterArcTemplate;
}

export interface FormulaBeat {
  id: string;
  name: string;
  description: string;
  purpose: string;
  runtimePercentStart: number;     // 0-100
  runtimePercentEnd: number;       // 0-100
  durationPercent: number;
  tensionLevel: number;            // 0-10
  emotionalTone: EmotionalTone;
  requiredElements: BeatRequirement[];
  suggestedSceneCount: { min: number; max: number };
  genreSpecific?: Record<Genre, Partial<FormulaBeat>>;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  musicMood: MusicMood;
  pacingSpeed: 'very-slow' | 'slow' | 'medium' | 'fast' | 'very-fast';
}

export type EmotionalTone =
  | 'neutral' | 'hopeful' | 'tense' | 'joyful' | 'sad'
  | 'fearful' | 'angry' | 'romantic' | 'comedic' | 'mysterious'
  | 'triumphant' | 'melancholic' | 'anxious' | 'peaceful'
  | 'horrified' | 'excited' | 'bittersweet' | 'desperate';

export type MusicMood =
  | 'none' | 'subtle-underscore' | 'building-tension' | 'full-orchestral'
  | 'comedic-sting' | 'romantic-theme' | 'action-driving' | 'horror-drone'
  | 'triumphant-swell' | 'melancholic-piano' | 'suspense-pulse'
  | 'silence' | 'ambient' | 'custom';

export interface BeatRequirement {
  type: 'character-intro' | 'plot-point' | 'revelation' | 'confrontation'
      | 'emotional-peak' | 'comic-relief' | 'action-sequence' | 'dialogue-heavy'
      | 'montage' | 'flashback' | 'dream-sequence' | 'time-jump';
  description: string;
  mandatory: boolean;
}

export type TransitionType =
  | 'cut' | 'fade-in' | 'fade-out' | 'fade-to-black' | 'dissolve'
  | 'wipe' | 'match-cut' | 'jump-cut' | 'smash-cut'
  | 'whip-pan' | 'iris' | 'freeze-frame' | 'time-lapse';

export interface PacingProfile {
  overall: 'slow-burn' | 'balanced' | 'fast-paced' | 'frenetic';
  tensionCurve: TensionPoint[];
  sceneLength: {
    averageSeconds: number;
    shortScenePercent: number;    // % of scenes under 60s
    longScenePercent: number;     // % of scenes over 180s
  };
}

export interface TensionPoint {
  runtimePercent: number;
  tensionLevel: number;          // 0-10
  label?: string;
}

export interface GenreRule {
  rule: string;
  timing?: string;
  example?: string;
}

export interface PlotStructure {
  mainPlot: PlotLine;
  subPlots: PlotLine[];
  screenTimeAllocation: {
    mainPlot: number;            // percentage
    subPlots: number[];
  };
}

export interface PlotLine {
  id: string;
  name: string;
  description: string;
  thematicFunction: string;
  involvedCharacters: string[];  // character IDs
}

export interface CharacterArcTemplate {
  arcType: 'positive' | 'negative' | 'flat' | 'disillusionment' | 'corruption';
  phases: ArcPhase[];
}

export interface ArcPhase {
  name: string;
  runtimePercentStart: number;
  runtimePercentEnd: number;
  characterState: string;
  internalConflict: string;
  externalManifest: string;
}

// ─── CHARACTER ───────────────────────────────────────────────────────────────

export type CharacterType =
  | 'human' | 'animal' | 'robot' | 'alien' | 'creature'
  | 'mythical' | 'anthropomorphic' | 'object' | 'abstract' | 'other';

export interface Character {
  id: string;
  name: string;
  type?: CharacterType;             // defaults to 'human' if omitted
  species?: string;                 // e.g. "golden retriever", "dragon", "battle droid"
  role: CharacterRole;
  importance: 'protagonist' | 'deuteragonist' | 'supporting' | 'minor' | 'extra' | 'cameo';
  screenTimePercent: number;
  arc: CharacterArcTemplate;

  // Visual identity (persists across all scenes)
  appearance: CharacterAppearance;
  defaultOutfit: Outfit;
  outfits: NamedOutfit[];           // wardrobe for different occasions
  accessories: Accessory[];

  // Voice identity
  voice: VoiceProfile;

  // Reference assets (generated during pre-production)
  referenceImages: ReferenceImage[];
  loraModelId?: string;             // trained LoRA for this character
  characterSheetUrl?: string;

  // Behavioral
  personality: string;
  speechPattern: string;
  mannerisms: string[];
  catchphrases?: string[];
}

export type CharacterRole =
  | 'hero' | 'mentor' | 'ally' | 'love-interest' | 'sidekick'
  | 'antagonist' | 'henchman' | 'trickster' | 'guardian'
  | 'herald' | 'shapeshifter' | 'shadow' | 'comic-relief';

export interface CharacterAppearance {
  age: number | string;             // number for humans, or descriptive ("ancient", "ageless")
  gender: string;
  ethnicity?: string;               // optional — omit for non-human characters
  height: string;                   // 'very-short' | 'short' | 'average' | 'tall' | 'very-tall' | 'massive' | 'tiny'
  build: string;                    // 'slim' | 'average' | 'athletic' | 'muscular' | 'heavy' | 'petite' | 'bulky'
  skinTone: string;                 // skin/fur/scales/metal color and texture
  hairColor: string;
  hairStyle: string;
  hairLength: string;               // 'bald' | 'buzz' | 'short' | 'medium' | 'long' | 'very-long' | 'none'
  eyeColor: string;
  facialHair?: string;
  bodyDescription?: string;         // full visual description — critical for non-human characters
  distinctiveFeatures: string[];    // scars, tattoos, birthmarks, tail, wings, antenna, etc.
  customDescription?: string;       // free-text for anything not covered
}

export interface Outfit {
  id: string;
  top: ClothingItem;
  bottom: ClothingItem;
  footwear: ClothingItem;
  outerwear?: ClothingItem;
  headwear?: ClothingItem;
  customDescription?: string;
}

export interface NamedOutfit extends Outfit {
  name: string;                     // e.g., "Work clothes", "Party outfit", "Pajamas"
  usedInScenes?: string[];
}

export interface ClothingItem {
  type: string;                     // e.g., "t-shirt", "jeans", "sneakers"
  color: string;
  material?: string;
  pattern?: string;                 // solid, striped, plaid, floral, etc.
  brand?: string;
  condition?: 'pristine' | 'worn' | 'dirty' | 'damaged';
  details?: string;
}

export interface Accessory {
  type: 'jewelry' | 'bag' | 'glasses' | 'watch' | 'hat' | 'scarf'
      | 'weapon' | 'tool' | 'tech-device' | 'other';
  name: string;
  description: string;
  color?: string;
  wornWhen: 'always' | 'usually' | 'sometimes' | 'specific-scenes';
  significanceLevel: 'cosmetic' | 'character-defining' | 'plot-important';
}

export interface VoiceProfile {
  provider: 'elevenlabs' | 'resemble' | 'playht' | 'azure' | 'custom';
  voiceId?: string;                 // pre-cloned voice ID
  gender: string;
  age: 'child' | 'teen' | 'young-adult' | 'adult' | 'middle-aged' | 'elderly';
  pitch: 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
  tone: 'warm' | 'cold' | 'raspy' | 'smooth' | 'nasal' | 'deep' | 'bright';
  accent?: string;
  speakingSpeed: 'slow' | 'normal' | 'fast';
  emotionalRange: string[];         // e.g., ['anger', 'sadness', 'joy', 'fear']
  customPrompt?: string;
}

export interface ReferenceImage {
  url: string;
  angle: 'front' | 'three-quarter' | 'profile' | 'back' | 'above' | 'below';
  expression: string;
  outfit: string;                   // outfit ID
  notes?: string;
}

// ─── LOCATION ────────────────────────────────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  description: string;
  timeOfDay: TimeOfDay;
  weather?: WeatherCondition;
  ambientSound?: string;            // description of ambient audio
  mood: EmotionalTone;

  // Visual specs
  interior: boolean;
  dimensions?: string;              // e.g., "small cramped apartment", "vast open field"
  colorScheme: string[];
  keyFeatures: string[];            // notable visual elements
  lightingCondition: LightingPreset;
  furnitureAndProps?: string[];

  // Consistency
  panoramaUrl?: string;             // 360-degree reference panorama
  referenceImages: LocationReference[];
  seedValue?: number;               // for reproducible generation

  // Relationships
  connectedLocations?: string[];    // location IDs of adjacent areas
  usedInScenes: string[];           // scene IDs
}

export type LocationType =
  | 'home-interior' | 'home-exterior' | 'office' | 'school' | 'hospital'
  | 'restaurant' | 'bar' | 'street' | 'park' | 'forest' | 'beach'
  | 'mountain' | 'city-skyline' | 'subway' | 'car-interior' | 'airport'
  | 'store' | 'warehouse' | 'rooftop' | 'alley' | 'courtroom'
  | 'stage' | 'spaceship' | 'fantasy-realm' | 'underwater' | 'custom';

export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'golden-hour' | 'dusk' | 'evening' | 'night' | 'late-night';

export type WeatherCondition = 'clear' | 'cloudy' | 'overcast' | 'rainy' | 'stormy' | 'snowy' | 'foggy' | 'windy' | 'hazy';

export interface LocationReference {
  url: string;
  angle: string;
  timeOfDay: TimeOfDay;
  notes?: string;
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

export interface Prop {
  id: string;
  name: string;
  description: string;
  significance: 'background' | 'interactive' | 'plot-critical';
  referenceImageUrl?: string;
  usedByCharacters?: string[];
  usedInScenes?: string[];
  appearance: string;               // visual description for prompting
}

// ─── MUSIC ───────────────────────────────────────────────────────────────────

export interface MusicTheme {
  id: string;
  name: string;                     // e.g., "Main Theme", "Love Theme", "Villain's Motif"
  description: string;
  mood: MusicMood;
  tempo: 'very-slow' | 'slow' | 'moderate' | 'fast' | 'very-fast';
  genre: string;                    // musical genre: orchestral, electronic, jazz, etc.
  instruments: string[];
  referenceTrackUrl?: string;       // generated reference
  generationPrompt: string;         // prompt for AI music gen
  provider: 'soundraw' | 'suno' | 'aiva' | 'stable-audio' | 'custom';
  durationSeconds?: number;
  variations: MusicVariation[];
}

export interface MusicVariation {
  id: string;
  name: string;                     // e.g., "Tense version", "Quiet version"
  moodShift: string;
  tempoChange?: string;
  instrumentChanges?: string;
  generationPrompt: string;
}

// ─── ACTS / SEQUENCES / SCENES / SHOTS ──────────────────────────────────────

export interface Act {
  id: string;
  number: number;
  name: string;
  description: string;
  formulaBeatIds: string[];         // which formula beats this act covers
  runtimePercentStart: number;
  runtimePercentEnd: number;
  sequences: Sequence[];
}

export interface Sequence {
  id: string;
  number: number;
  name: string;
  goal: string;                     // what this sequence is trying to accomplish
  formulaBeatId: string;            // which formula beat
  scenes: Scene[];
}

export interface Scene {
  id: string;
  number: number;
  title: string;
  slugline: string;                 // INT./EXT. LOCATION - TIME
  description: string;              // what happens in this scene
  purpose: string;                  // why this scene exists narratively

  // Location & time
  locationId: string;
  locationOverrides?: Partial<Location>;  // scene-specific overrides (e.g., different time of day)
  timeOfDay: TimeOfDay;
  weather?: WeatherCondition;
  elapsedTimeSincePrevious?: string;      // e.g., "2 hours later", "next morning"

  // Characters in scene
  charactersPresent: SceneCharacter[];

  // Content
  events: SceneEvent[];
  dialogue: DialogueLine[];

  // Shots (the visual breakdown)
  shots: Shot[];

  // Audio
  musicThemeId?: string;
  musicVariationId?: string;
  musicAction: MusicAction;
  ambientSounds: SoundEffect[];
  soundEffects: SoundEffect[];

  // Pacing
  estimatedDurationSeconds: number;
  tensionLevel: number;             // 0-10
  emotionalTone: EmotionalTone;
  pacingSpeed: 'very-slow' | 'slow' | 'medium' | 'fast' | 'very-fast';

  // Transitions
  transitionIn: TransitionType;
  transitionOut: TransitionType;

  // Generation status
  generationStatus: GenerationStatus;
  userApproved: boolean;
}

export interface SceneCharacter {
  characterId: string;
  outfitId: string;                 // which outfit they're wearing
  activeAccessories: string[];      // accessory IDs worn in this scene
  entrancePoint?: string;           // when/how they enter
  exitPoint?: string;               // when/how they exit
  emotionalState: EmotionalTone;
  action: string;                   // what they're doing
  position?: ScenePosition;
  continuityFromPrevScene: boolean; // same clothes as previous appearance?
}

export interface ScenePosition {
  placement: 'left' | 'center-left' | 'center' | 'center-right' | 'right';
  depth: 'foreground' | 'midground' | 'background';
  posture: 'standing' | 'sitting' | 'lying' | 'walking' | 'running' | 'crouching' | 'custom';
  facing: 'camera' | 'away' | 'left' | 'right' | 'other-character' | 'custom';
}

export interface SceneEvent {
  order: number;
  type: 'action' | 'dialogue' | 'reaction' | 'revelation' | 'transition' | 'pause';
  description: string;
  involvedCharacters: string[];     // character IDs
  emotionalShift?: EmotionalTone;
  duration?: number;                // seconds
}

export interface DialogueLine {
  order: number;
  characterId: string;
  text: string;
  parenthetical?: string;          // e.g., "(whispering)", "(sarcastically)"
  emotion: EmotionalTone;
  volumeLevel: 'whisper' | 'quiet' | 'normal' | 'loud' | 'shouting';
}

export type MusicAction =
  | 'continue' | 'start' | 'stop' | 'fade-in' | 'fade-out'
  | 'swell' | 'drop' | 'transition' | 'sting' | 'silence';

export interface SoundEffect {
  id: string;
  name: string;
  description: string;             // e.g., "door creaking open", "thunder rumble"
  triggerPoint: number;             // seconds into scene
  duration: number;                 // seconds
  volume: 'background' | 'subtle' | 'normal' | 'prominent' | 'loud';
  generationPrompt: string;
  provider: 'elevenlabs' | 'stable-audio' | 'custom';
  generatedUrl?: string;
}

// ─── SHOT (the core visual unit) ─────────────────────────────────────────────

export interface Shot {
  id: string;
  number: number;
  sceneId: string;
  description: string;

  // The key innovation: first frame + last frame specification
  firstFrame: FrameSpec;
  lastFrame: FrameSpec;

  // Camera
  camera: CameraSpec;

  // Characters in this specific shot
  characters: FrameCharacter[];

  // Timing
  durationSeconds: number;

  // Dialogue occurring during this shot
  dialogueLineIds: string[];

  // Sound
  soundEffectIds: string[];

  // Generation
  videoGeneration: VideoGenerationSpec;
  generationStatus: GenerationStatus;
  generatedVideoUrl?: string;
  alternatives: GeneratedAlternative[];  // multiple options for user to choose from

  // User control
  userApproved: boolean;
  userNotes?: string;
}

export interface FrameSpec {
  // Composition
  description: string;              // natural language description of the frame
  backgroundDescription: string;    // what's in the background
  foregroundElements: string[];     // what's in the foreground

  // Characters in frame
  characters: FrameCharacter[];

  // Visual properties
  cameraAngle: CameraAngle;
  shotSize: ShotSize;
  focusPoint: string;               // what the camera is focused on
  depthOfField: 'shallow' | 'normal' | 'deep';
  lightingOverride?: string;

  // Generated assets
  generationPrompt: string;         // full prompt for image generation
  imageProvider: 'flux-kontext' | 'midjourney' | 'gpt-image' | 'nano-banana' | 'stable-diffusion' | 'custom';
  generatedImageUrl?: string;
  generationStatus: GenerationStatus;
  alternatives: GeneratedAlternative[];
  userApproved: boolean;
}

export interface FrameCharacter {
  characterId: string;
  outfitId: string;
  accessoryIds: string[];
  pose: string;                     // e.g., "arms crossed, looking left"
  expression: string;               // e.g., "slight smirk", "wide-eyed fear"
  position: ScenePosition;
  action: string;                   // what they're physically doing
  interactingWith?: string;         // character ID or prop ID
}

export type CameraAngle =
  | 'eye-level' | 'low-angle' | 'high-angle' | 'birds-eye'
  | 'worms-eye' | 'dutch-angle' | 'over-the-shoulder' | 'pov';

export type ShotSize =
  | 'extreme-wide' | 'wide' | 'full' | 'medium-wide' | 'medium'
  | 'medium-close' | 'close-up' | 'extreme-close-up' | 'insert';

export interface CameraSpec {
  movement: CameraMovement;
  startAngle: CameraAngle;
  endAngle: CameraAngle;
  startSize: ShotSize;
  endSize: ShotSize;
  speed: 'very-slow' | 'slow' | 'normal' | 'fast' | 'very-fast';
  stabilization: 'locked' | 'smooth' | 'handheld' | 'shaky';
  specialMove?: string;            // e.g., "crane up", "dolly zoom", "rack focus"
}

export type CameraMovement =
  | 'static' | 'pan-left' | 'pan-right' | 'tilt-up' | 'tilt-down'
  | 'dolly-in' | 'dolly-out' | 'tracking-left' | 'tracking-right'
  | 'crane-up' | 'crane-down' | 'orbit' | 'handheld-drift'
  | 'zoom-in' | 'zoom-out' | 'whip-pan' | 'steadicam-follow';

// ─── VIDEO GENERATION ────────────────────────────────────────────────────────

export interface VideoGenerationSpec {
  provider: VideoProvider;
  method: VideoMethod;
  firstFrameImageUrl: string;      // URL of generated first frame image
  lastFrameImageUrl: string;       // URL of generated last frame image
  prompt: string;                  // text prompt for the video generation
  characterReferenceUrls: string[];  // reference images for character consistency
  durationSeconds: number;
  resolution: Resolution;
  fps: 24 | 30 | 60;
  withAudio: boolean;              // if provider supports native audio
  audioPrompt?: string;
  estimatedCost: number;
}

export type VideoProvider =
  | 'runway-gen4' | 'runway-gen3-turbo'
  | 'veo-3.1' | 'veo-3.1-fast' | 'veo-3'
  | 'pika-pikaframes' | 'pika-2.2'
  | 'kling-3.0' | 'kling-o1'
  | 'hailuo-2.3'
  | 'luma-ray3'
  | 'sora-2'
  | 'wan-2.6'
  | 'seedance-2.0';

export type VideoMethod =
  | 'text-to-video'
  | 'image-to-video'
  | 'first-last-frame'
  | 'multi-keyframe'
  | 'character-reference'
  | 'video-to-video';

// ─── GENERATION STATUS & ALTERNATIVES ────────────────────────────────────────

export type GenerationStatus = 'not-started' | 'queued' | 'generating' | 'complete' | 'failed' | 'regenerating';

export interface GeneratedAlternative {
  id: string;
  url: string;
  provider: string;
  prompt: string;
  score?: number;                  // AI quality score 0-100
  userRating?: number;             // user rating 1-5
  selected: boolean;
  generatedAt: string;
}

// ─── PIPELINE CONFIGURATION ──────────────────────────────────────────────────

export interface PipelineConfig {
  imageGeneration: ImageGenConfig;
  videoGeneration: VideoGenConfig;
  voiceGeneration: VoiceGenConfig;
  musicGeneration: MusicGenConfig;
  soundEffectGeneration: SoundGenConfig;
  mixing: MixingConfig;
  qualityControl: QualityControlConfig;
}

export interface ImageGenConfig {
  primaryProvider: 'flux-kontext' | 'midjourney' | 'gpt-image' | 'nano-banana' | 'stable-diffusion';
  fallbackProvider: string;
  characterConsistencyMethod: 'lora' | 'ip-adapter' | 'cref' | 'kontext-iterative' | 'reference-image';
  maxAlternatives: number;         // how many options to generate per frame
  autoSelectBest: boolean;
  qualityThreshold: number;        // 0-100, auto-reject below this
}

export interface VideoGenConfig {
  providers: VideoProviderConfig[];
  routing: VideoRoutingRules;
  maxAlternatives: number;
  chainMethod: 'last-frame-to-first' | 'overlap' | 'transition-gen';
}

export interface VideoProviderConfig {
  provider: VideoProvider;
  enabled: boolean;
  priority: number;                // lower = preferred
  maxCostPerSecond: number;
  capabilities: VideoMethod[];
  bestFor: string[];               // e.g., ['dialogue', 'character-consistency']
  apiKey?: string;
}

export interface VideoRoutingRules {
  dialogue: VideoProvider;         // best for scenes with dialogue
  action: VideoProvider;           // best for action sequences
  emotional: VideoProvider;        // best for emotional/subtle scenes
  establishing: VideoProvider;     // best for wide establishing shots
  transition: VideoProvider;       // best for transition shots
  default: VideoProvider;
}

export interface VoiceGenConfig {
  primaryProvider: 'elevenlabs' | 'resemble' | 'playht' | 'azure';
  emotionalProvider: 'resemble' | 'elevenlabs';  // best for emotional range
  apiKey?: string;
}

export interface MusicGenConfig {
  underscoreProvider: 'soundraw' | 'aiva' | 'stable-audio';
  songProvider: 'suno' | 'soundraw';
  orchestralProvider: 'aiva' | 'suno';
  apiKeys?: Record<string, string>;
}

export interface SoundGenConfig {
  provider: 'elevenlabs' | 'stable-audio';
  apiKey?: string;
}

export interface MixingConfig {
  provider: 'auphonic' | 'manual';
  autoDucking: boolean;            // lower music during dialogue
  loudnessTarget: number;          // LUFS target
  dialoguePriority: boolean;
}

export interface QualityControlConfig {
  autoRegenOnLowScore: boolean;
  minimumQualityScore: number;     // 0-100
  maxRegenerationAttempts: number;
  humanReviewRequired: 'all' | 'below-threshold' | 'none';
  consistencyCheck: boolean;       // auto-check character consistency
}

// ─── USER INTERACTION ────────────────────────────────────────────────────────

export interface UserDecisionPoint {
  id: string;
  type: 'frame-approval' | 'shot-approval' | 'scene-approval'
      | 'character-design' | 'location-design' | 'music-selection'
      | 'voice-selection' | 'style-choice';
  elementId: string;               // ID of the element being decided on
  options: GeneratedAlternative[];
  autoSelected?: string;           // ID of auto-selected option
  userSelected?: string;           // ID of user-selected option
  canRegenerate: boolean;
  canEditPrompt: boolean;
  canTypeCustom: boolean;          // user can type their own description
  status: 'pending' | 'auto-approved' | 'user-approved' | 'user-modified';
}

// ─── EXPORT / ASSEMBLY ───────────────────────────────────────────────────────

export interface FinalAssembly {
  projectId: string;
  totalDurationSeconds: number;
  outputFormat: 'mp4' | 'mov' | 'webm';
  resolution: Resolution;
  fps: number;
  audioTracks: AudioTrack[];
  videoSegments: VideoSegment[];
  exportStatus: 'pending' | 'assembling' | 'rendering' | 'complete' | 'failed';
  outputUrl?: string;
}

export interface AudioTrack {
  type: 'dialogue' | 'music' | 'sound-effects' | 'ambient';
  segments: AudioSegment[];
  volumeLevel: number;             // 0-1
  ducking: boolean;
}

export interface AudioSegment {
  url: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  fadeIn?: number;
  fadeOut?: number;
  volume: number;
}

export interface VideoSegment {
  shotId: string;
  videoUrl: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  transitionDuration?: number;
}

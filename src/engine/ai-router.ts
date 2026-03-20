// ============================================================================
// AI ROUTER
// Intelligently routes each generation task to the best AI tool based on
// scene type, budget, quality requirements, and kid mode constraints.
// ============================================================================

import type {
  Scene, Shot, EmotionalTone, VideoProvider, Genre,
} from '../types';

// ─── ROUTING DECISION ────────────────────────────────────────────────────────

export interface RoutingDecision {
  imageProvider: string;
  videoProvider: VideoProvider;
  voiceProvider: string;
  musicProvider: string;
  sfxProvider: string;
  reasoning: string;
  estimatedCost: number;
  estimatedTimeSeconds: number;
}

// ─── SCENE ANALYSIS ──────────────────────────────────────────────────────────

export interface SceneAnalysis {
  hasDialogue: boolean;
  dialogueLineCount: number;
  hasAction: boolean;
  isEmotional: boolean;
  isEstablishing: boolean;
  isTransition: boolean;
  characterCount: number;
  tensionLevel: number;
  requiresAudio: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
}

// ─── AI ROUTER ───────────────────────────────────────────────────────────────

export class AIRouter {

  private kidMode: boolean;
  private budgetMode: 'economy' | 'standard' | 'premium';

  constructor(kidMode: boolean = false, budgetMode: 'economy' | 'standard' | 'premium' = 'standard') {
    this.kidMode = kidMode;
    this.budgetMode = budgetMode;
  }

  /**
   * Analyze a scene to determine its characteristics for routing
   */
  analyzeScene(scene: Scene): SceneAnalysis {
    return {
      hasDialogue: scene.dialogue.length > 0,
      dialogueLineCount: scene.dialogue.length,
      hasAction: scene.events.some(e => e.type === 'action'),
      isEmotional: this.isEmotionalTone(scene.emotionalTone),
      isEstablishing: scene.shots.length > 0 && scene.shots[0]?.firstFrame?.shotSize === 'extreme-wide',
      isTransition: scene.estimatedDurationSeconds < 10,
      characterCount: scene.charactersPresent.length,
      tensionLevel: scene.tensionLevel,
      requiresAudio: scene.dialogue.length > 0 || scene.soundEffects.length > 0,
      complexity: this.assessComplexity(scene),
    };
  }

  /**
   * Route a scene to the best AI tools
   */
  routeScene(scene: Scene): RoutingDecision {
    const analysis = this.analyzeScene(scene);

    // Video provider selection
    let videoProvider: VideoProvider;
    let reasoning: string;

    if (analysis.isTransition) {
      videoProvider = 'pika-pikaframes';
      reasoning = 'Transition scene → Pika Pikaframes (multi-keyframe, cheapest)';
    } else if (analysis.hasDialogue && analysis.dialogueLineCount > 3) {
      videoProvider = this.budgetMode === 'premium' ? 'veo-3.1' : 'veo-3.1-fast';
      reasoning = `Dialogue-heavy scene (${analysis.dialogueLineCount} lines) → Veo 3.1 (native audio + lip sync)`;
    } else if (analysis.hasAction && analysis.tensionLevel >= 7) {
      videoProvider = 'kling-3.0';
      reasoning = 'High-tension action scene → Kling 3.0 (best physics, 4K, multi-shot)';
    } else if (analysis.isEmotional && analysis.characterCount <= 2) {
      videoProvider = 'hailuo-2.3';
      reasoning = 'Emotional scene with few characters → Hailuo 2.3 (best micro-expressions)';
    } else if (analysis.characterCount >= 3) {
      videoProvider = 'runway-gen4';
      reasoning = 'Multi-character scene → Runway Gen-4 (best character consistency)';
    } else if (this.budgetMode === 'economy') {
      videoProvider = 'wan-2.6';
      reasoning = 'Economy mode → Wan 2.6 (cheapest, good quality, open source)';
    } else {
      videoProvider = 'runway-gen4';
      reasoning = 'Default → Runway Gen-4 Turbo (best overall balance)';
    }

    // Image provider selection
    let imageProvider: string;
    if (analysis.characterCount >= 4) {
      imageProvider = 'nano-banana-2';
    } else {
      imageProvider = 'flux-kontext';
    }

    // Voice provider
    let voiceProvider: string;
    if (analysis.isEmotional && analysis.hasDialogue) {
      voiceProvider = 'resemble';  // best emotional range
    } else {
      voiceProvider = 'elevenlabs'; // best overall
    }

    // Music provider
    const musicProvider = 'soundraw'; // best for underscore with API

    // Cost estimation
    const estimatedCost = this.estimateCost(scene, videoProvider, imageProvider);

    return {
      imageProvider,
      videoProvider,
      voiceProvider,
      musicProvider,
      sfxProvider: 'elevenlabs-sfx',
      reasoning,
      estimatedCost,
      estimatedTimeSeconds: this.estimateTime(scene, videoProvider),
    };
  }

  /**
   * Route a shot to the best video generation method
   */
  routeShot(shot: Shot, scene: Scene): {
    provider: VideoProvider;
    method: 'first-last-frame' | 'multi-keyframe' | 'image-to-video' | 'character-reference';
    reasoning: string;
  } {
    // If both first and last frames are defined → first-last-frame interpolation
    if (shot.firstFrame?.generatedImageUrl && shot.lastFrame?.generatedImageUrl) {
      // For transitions with complex motion, use Pika's 5-keyframe
      // All shots are 8s — use Veo 3.1 for native audio + first/last frame interpolation
      return {
        provider: 'veo-3.1',
        method: 'first-last-frame',
        reasoning: 'Veo 3.1 — 8s clip with first/last frame interpolation, native audio, and reference images',
      };
    }

    // Fallback: image-to-video from first frame only
    return {
      provider: 'runway-gen4',
      method: 'image-to-video',
      reasoning: 'Only first frame available → Runway Gen-4 image-to-video',
    };
  }

  /**
   * Generate parallel execution plan for a batch of scenes
   */
  planParallelExecution(scenes: Scene[]): ParallelPlan {
    const phases: ParallelPhase[] = [];

    // Phase 1: All first frames (parallel)
    const firstFrameTasks = scenes.flatMap(scene =>
      scene.shots.map(shot => ({
        taskId: `first-frame-${shot.id}`,
        type: 'image-gen' as const,
        shotId: shot.id,
        sceneId: scene.id,
        dependsOn: [],
      }))
    );
    phases.push({ name: 'First Frames', tasks: firstFrameTasks, parallel: true });

    // Phase 2: All last frames (parallel, can run simultaneously with first frames)
    const lastFrameTasks = scenes.flatMap(scene =>
      scene.shots.map(shot => ({
        taskId: `last-frame-${shot.id}`,
        type: 'image-gen' as const,
        shotId: shot.id,
        sceneId: scene.id,
        dependsOn: [],
      }))
    );
    phases.push({ name: 'Last Frames', tasks: lastFrameTasks, parallel: true });

    // Phase 3: Video generation (depends on both frames being approved)
    const videoTasks = scenes.flatMap(scene =>
      scene.shots.map(shot => ({
        taskId: `video-${shot.id}`,
        type: 'video-gen' as const,
        shotId: shot.id,
        sceneId: scene.id,
        dependsOn: [`first-frame-${shot.id}`, `last-frame-${shot.id}`],
      }))
    );
    phases.push({ name: 'Video Generation', tasks: videoTasks, parallel: true });

    // Phase 4: Transitions (depends on adjacent videos)
    const transitionTasks: ParallelTask[] = [];
    for (let i = 0; i < scenes.length - 1; i++) {
      const lastShotOfScene = scenes[i].shots[scenes[i].shots.length - 1];
      const firstShotOfNextScene = scenes[i + 1].shots[0];
      if (lastShotOfScene && firstShotOfNextScene) {
        transitionTasks.push({
          taskId: `transition-${scenes[i].id}-${scenes[i + 1].id}`,
          type: 'transition-gen',
          shotId: `${lastShotOfScene.id}-${firstShotOfNextScene.id}`,
          sceneId: `${scenes[i].id}-${scenes[i + 1].id}`,
          dependsOn: [`video-${lastShotOfScene.id}`, `video-${firstShotOfNextScene.id}`],
        });
      }
    }
    phases.push({ name: 'Transitions', tasks: transitionTasks, parallel: true });

    // Phase 5: Audio (can run in parallel with video)
    const audioTasks = scenes.flatMap(scene => {
      const tasks: ParallelTask[] = [];
      // Dialogue
      if (scene.dialogue.length > 0) {
        tasks.push({
          taskId: `dialogue-${scene.id}`,
          type: 'voice-gen',
          shotId: '',
          sceneId: scene.id,
          dependsOn: [],  // can start immediately
        });
      }
      // Music
      if (scene.musicThemeId) {
        tasks.push({
          taskId: `music-${scene.id}`,
          type: 'music-gen',
          shotId: '',
          sceneId: scene.id,
          dependsOn: [],
        });
      }
      // SFX
      if (scene.soundEffects.length > 0) {
        tasks.push({
          taskId: `sfx-${scene.id}`,
          type: 'sfx-gen',
          shotId: '',
          sceneId: scene.id,
          dependsOn: [],
        });
      }
      return tasks;
    });
    phases.push({ name: 'Audio', tasks: audioTasks, parallel: true });

    return {
      phases,
      totalTasks: phases.reduce((sum, p) => sum + p.tasks.length, 0),
      estimatedParallelTime: this.estimateParallelTime(phases),
    };
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────

  private isEmotionalTone(tone: EmotionalTone): boolean {
    return ['sad', 'romantic', 'melancholic', 'bittersweet', 'desperate', 'fearful'].includes(tone);
  }

  private assessComplexity(scene: Scene): 'simple' | 'moderate' | 'complex' {
    const factors = [
      scene.charactersPresent.length > 3,
      scene.dialogue.length > 10,
      scene.events.length > 5,
      scene.soundEffects.length > 3,
      scene.estimatedDurationSeconds > 180,
    ];
    const score = factors.filter(Boolean).length;
    if (score >= 3) return 'complex';
    if (score >= 1) return 'moderate';
    return 'simple';
  }

  private estimateCost(scene: Scene, videoProvider: VideoProvider, imageProvider: string): number {
    const costs: Record<string, number> = {
      'runway-gen4': 0.05,
      'veo-3.1': 0.40,
      'veo-3.1-fast': 0.15,
      'pika-pikaframes': 0.04,
      'kling-3.0': 0.10,
      'kling-o1': 0.112,
      'hailuo-2.3': 0.05,
      'wan-2.6': 0.03,
    };

    const imageCosts: Record<string, number> = {
      'flux-kontext': 0.04,
      'nano-banana-2': 0.04,
      'gpt-image-1': 0.042,
    };

    const videoCost = (costs[videoProvider] || 0.05) * scene.estimatedDurationSeconds;
    const imageCost = (imageCosts[imageProvider] || 0.04) * scene.shots.length * 2; // first + last frame
    const voiceCost = scene.dialogue.length * 0.01;  // rough estimate

    return Math.round((videoCost + imageCost + voiceCost) * 100) / 100;
  }

  private estimateTime(scene: Scene, provider: VideoProvider): number {
    // Rough generation time estimates per second of output
    const timeMultipliers: Record<string, number> = {
      'runway-gen4': 15,
      'veo-3.1': 30,
      'veo-3.1-fast': 10,
      'pika-pikaframes': 20,
      'kling-3.0': 20,
      'kling-o1': 25,
      'hailuo-2.3': 15,
      'wan-2.6': 20,
    };
    return (timeMultipliers[provider] || 20) * scene.shots.length;
  }

  private estimateParallelTime(phases: ParallelPhase[]): number {
    // Each parallel phase takes as long as its longest task
    // Sequential phases add up
    return phases.reduce((total, phase) => {
      const maxTaskTime = Math.max(...phase.tasks.map(() => 30)); // avg 30s per task
      return total + (phase.parallel ? maxTaskTime : maxTaskTime * phase.tasks.length);
    }, 0);
  }
}

// ─── PARALLEL EXECUTION TYPES ────────────────────────────────────────────────

interface ParallelPlan {
  phases: ParallelPhase[];
  totalTasks: number;
  estimatedParallelTime: number;
}

interface ParallelPhase {
  name: string;
  tasks: ParallelTask[];
  parallel: boolean;
}

interface ParallelTask {
  taskId: string;
  type: 'image-gen' | 'video-gen' | 'voice-gen' | 'music-gen' | 'sfx-gen' | 'transition-gen';
  shotId: string;
  sceneId: string;
  dependsOn: string[];
}

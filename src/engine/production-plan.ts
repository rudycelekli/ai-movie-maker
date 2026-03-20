// ============================================================================
// PRODUCTION PLAN
// Given a format type, calculates the time budget, shot count, scene count,
// and milestone count — so the AI generates content that fits the format.
// ============================================================================

import type { ProjectFormat } from '../types/index.js';

// ─── FORMAT SPECS ───────────────────────────────────────────────────────────

export interface FormatSpec {
  label: string;
  durationRange: { min: number; max: number };   // seconds
  defaultDuration: number;                         // seconds
  avgShotDuration: number;                         // seconds per shot
  scenesRange: { min: number; max: number };
  milestonesRange: { min: number; max: number };
  maxCharacters: number;
  maxLocations: number;
  description: string;
}

// All shots are 8 seconds to match Veo 3.1 clip length.
// Total duration = shots × 8s, so shot count drives the runtime.
export const FORMAT_SPECS: Record<string, FormatSpec> = {
  'ad-commercial-15': {
    label: '15s Ad Spot',
    durationRange: { min: 8, max: 24 },
    defaultDuration: 16,               // 2 shots × 8s
    avgShotDuration: 8,
    scenesRange: { min: 1, max: 2 },
    milestonesRange: { min: 2, max: 3 },
    maxCharacters: 2,
    maxLocations: 2,
    description: 'Quick punch — hook, product, CTA',
  },
  'ad-commercial-30': {
    label: '30s Ad Spot',
    durationRange: { min: 24, max: 40 },
    defaultDuration: 32,               // 4 shots × 8s
    avgShotDuration: 8,
    scenesRange: { min: 2, max: 4 },
    milestonesRange: { min: 3, max: 4 },
    maxCharacters: 3,
    maxLocations: 2,
    description: 'Setup problem, show solution, CTA',
  },
  'ad-commercial-60': {
    label: '60s Ad Spot',
    durationRange: { min: 48, max: 72 },
    defaultDuration: 64,               // 8 shots × 8s
    avgShotDuration: 8,
    scenesRange: { min: 3, max: 6 },
    milestonesRange: { min: 4, max: 5 },
    maxCharacters: 4,
    maxLocations: 3,
    description: 'Mini story — problem, struggle, solution, payoff',
  },
  'trailer': {
    label: 'Trailer (1-2 min)',
    durationRange: { min: 56, max: 152 },
    defaultDuration: 96,               // 12 shots × 8s
    avgShotDuration: 8,
    scenesRange: { min: 6, max: 12 },
    milestonesRange: { min: 4, max: 6 },
    maxCharacters: 5,
    maxLocations: 5,
    description: 'Fast cuts — tease the story, build hype, cliffhanger',
  },
  'music-video': {
    label: 'Music Video (3-4 min)',
    durationRange: { min: 152, max: 272 },
    defaultDuration: 208,              // 26 shots × 8s
    avgShotDuration: 8,
    scenesRange: { min: 5, max: 10 },
    milestonesRange: { min: 4, max: 6 },
    maxCharacters: 4,
    maxLocations: 4,
    description: 'Visual story synced to song structure — verse, chorus, bridge',
  },
  'short-film': {
    label: 'Short Film (5-15 min)',
    durationRange: { min: 304, max: 904 },
    defaultDuration: 600,              // 75 shots × 8s
    avgShotDuration: 8,
    scenesRange: { min: 8, max: 25 },
    milestonesRange: { min: 5, max: 10 },
    maxCharacters: 6,
    maxLocations: 5,
    description: 'Complete story arc — setup, confrontation, resolution',
  },
};

// ─── PRODUCTION PLAN ────────────────────────────────────────────────────────

export interface ProductionPlan {
  format: string;
  formatLabel: string;
  totalDurationSeconds: number;
  estimatedShots: number;
  estimatedScenes: number;
  estimatedMilestones: number;
  maxCharacters: number;
  maxLocations: number;
  avgShotDuration: number;
  estimatedGenerationTime: string;    // human-readable
  estimatedCost: string;              // rough estimate
  breakdown: PlanBreakdown[];
}

export interface PlanBreakdown {
  phase: string;
  items: number;
  estimatedTime: string;
}

export function buildProductionPlan(format: string): ProductionPlan {
  const spec = FORMAT_SPECS[format];
  if (!spec) throw new Error(`Unknown format: ${format}`);

  const totalSeconds = spec.defaultDuration;
  const estimatedShots = Math.round(totalSeconds / spec.avgShotDuration);
  const estimatedScenes = Math.round(
    (spec.scenesRange.min + spec.scenesRange.max) / 2
  );
  const estimatedMilestones = Math.round(
    (spec.milestonesRange.min + spec.milestonesRange.max) / 2
  );

  // Each shot = 2 images (first+last frame) + 1 video generation
  // Image gen: ~10s each, Video gen: ~30-60s each
  const imageGenTime = estimatedShots * 2 * 10;    // seconds
  const videoGenTime = estimatedShots * 45;          // seconds
  const scriptGenTime = 30 + (estimatedMilestones * 15) + (estimatedScenes * 20);
  const totalGenTime = scriptGenTime + imageGenTime + videoGenTime;

  // Cost: ~$0.05/image, ~$0.20/video-second
  const imageCost = estimatedShots * 2 * 0.05;
  const videoCost = totalSeconds * 0.10;
  const scriptCost = 0.50;  // Claude API calls

  return {
    format,
    formatLabel: spec.label,
    totalDurationSeconds: totalSeconds,
    estimatedShots,
    estimatedScenes,
    estimatedMilestones,
    maxCharacters: spec.maxCharacters,
    maxLocations: spec.maxLocations,
    avgShotDuration: spec.avgShotDuration,
    estimatedGenerationTime: formatTime(totalGenTime),
    estimatedCost: `~$${(imageCost + videoCost + scriptCost).toFixed(2)}`,
    breakdown: [
      { phase: 'Script & Planning', items: estimatedMilestones, estimatedTime: formatTime(scriptGenTime) },
      { phase: 'Image Generation', items: estimatedShots * 2, estimatedTime: formatTime(imageGenTime) },
      { phase: 'Video Generation', items: estimatedShots, estimatedTime: formatTime(videoGenTime) },
    ],
  };
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

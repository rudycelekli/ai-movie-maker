// ============================================================================
// CHARACTER MANAGER
// Maintains character consistency across all scenes. Tracks what each character
// is wearing, where they are, and their emotional/physical state at every point.
// ============================================================================

import type { Character, Scene, Shot, NamedOutfit, Accessory, EmotionalTone } from '../types';

// ─── CHARACTER STATE (at any point in the story) ─────────────────────────────

export interface CharacterState {
  characterId: string;
  sceneId: string;
  sceneNumber: number;

  // What they're wearing RIGHT NOW
  currentOutfitId: string;
  activeAccessories: string[];

  // Physical/emotional state
  emotionalState: EmotionalTone;
  physicalCondition: 'normal' | 'tired' | 'injured' | 'wet' | 'dirty' | 'dressed-up' | 'disguised';
  injuryDetails?: string;          // e.g., "cut on left cheek" — persists until healed

  // Location
  currentLocationId: string;
  lastSeenInSceneId: string;

  // Continuity flags
  timeElapsedSinceLastScene: string | null;  // null = continuous, otherwise "2 hours", "next day"
  shouldChangeOutfit: boolean;                // true if enough time passed for outfit change
}

// ─── OUTFIT CHANGE RULES ─────────────────────────────────────────────────────

export interface OutfitChangeRule {
  trigger: 'time-jump' | 'new-day' | 'event' | 'location-change' | 'manual';
  description: string;
  minimumTimeSeparation?: string;  // e.g., "6 hours"
}

const DEFAULT_OUTFIT_CHANGE_RULES: OutfitChangeRule[] = [
  {
    trigger: 'new-day',
    description: 'Characters change clothes when a new day starts',
    minimumTimeSeparation: '8 hours',
  },
  {
    trigger: 'event',
    description: 'Characters change for special events (party, work, date, etc.)',
  },
  {
    trigger: 'location-change',
    description: 'Certain location changes imply outfit changes (home→work, casual→formal)',
  },
];

// ─── CHARACTER MANAGER ───────────────────────────────────────────────────────

export class CharacterManager {
  private characters: Map<string, Character> = new Map();
  private stateHistory: Map<string, CharacterState[]> = new Map();  // characterId → states over time
  private outfitRules: OutfitChangeRule[] = DEFAULT_OUTFIT_CHANGE_RULES;

  constructor(characters: Character[]) {
    for (const char of characters) {
      this.characters.set(char.id, char);
      this.stateHistory.set(char.id, []);
    }
  }

  /**
   * Get the current state of a character (based on the latest scene they appeared in)
   */
  getCurrentState(characterId: string): CharacterState | null {
    const history = this.stateHistory.get(characterId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  /**
   * Determine what a character should wear in a new scene, based on:
   * - What they wore last
   * - How much time has passed
   * - Whether they're in a new location type
   * - Whether there's a special event
   */
  resolveOutfitForScene(
    characterId: string,
    scene: Scene,
    timeElapsed: string | null,
    eventType?: string
  ): { outfitId: string; accessories: string[]; reasoning: string } {
    const character = this.characters.get(characterId);
    if (!character) throw new Error(`Character ${characterId} not found`);

    const lastState = this.getCurrentState(characterId);

    // First appearance — use default outfit
    if (!lastState) {
      return {
        outfitId: character.defaultOutfit.id,
        accessories: character.accessories
          .filter(a => a.wornWhen === 'always')
          .map(a => a.name),
        reasoning: 'First appearance — using default outfit',
      };
    }

    // No time has passed — same outfit
    if (!timeElapsed) {
      return {
        outfitId: lastState.currentOutfitId,
        accessories: lastState.activeAccessories,
        reasoning: 'Continuous scene — maintaining same outfit',
      };
    }

    // Time has passed — check if outfit change is warranted
    const hoursElapsed = this.parseTimeToHours(timeElapsed);

    if (hoursElapsed >= 8 || timeElapsed.includes('next day') || timeElapsed.includes('morning')) {
      // New day or significant time — change outfit
      const nextOutfit = this.selectNextOutfit(character, lastState.currentOutfitId, scene);
      return {
        outfitId: nextOutfit.id,
        accessories: this.selectAccessories(character, nextOutfit, scene),
        reasoning: `${timeElapsed} has passed — changing outfit to ${nextOutfit.name}`,
      };
    }

    // Special event — might need specific outfit
    if (eventType) {
      const eventOutfit = character.outfits.find(o =>
        o.name.toLowerCase().includes(eventType.toLowerCase())
      );
      if (eventOutfit) {
        return {
          outfitId: eventOutfit.id,
          accessories: this.selectAccessories(character, eventOutfit, scene),
          reasoning: `Event "${eventType}" — wearing ${eventOutfit.name}`,
        };
      }
    }

    // Default: keep current outfit
    return {
      outfitId: lastState.currentOutfitId,
      accessories: lastState.activeAccessories,
      reasoning: `Only ${timeElapsed} elapsed — keeping current outfit`,
    };
  }

  /**
   * Record a character's state in a scene (called after scene is finalized)
   */
  recordState(state: CharacterState): void {
    const history = this.stateHistory.get(state.characterId);
    if (history) {
      history.push(state);
    }
  }

  /**
   * Validate continuity across all scenes
   */
  validateContinuity(): ContinuityReport {
    const issues: ContinuityIssue[] = [];

    for (const [charId, history] of this.stateHistory.entries()) {
      const character = this.characters.get(charId);
      if (!character) continue;

      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];

        // Check: outfit changed without time passing
        if (!curr.timeElapsedSinceLastScene &&
            curr.currentOutfitId !== prev.currentOutfitId) {
          issues.push({
            characterId: charId,
            characterName: character.name,
            type: 'outfit-change-no-time',
            sceneNumber: curr.sceneNumber,
            detail: `Outfit changed from "${prev.currentOutfitId}" to "${curr.currentOutfitId}" with no time elapsed`,
            severity: 'error',
          });
        }

        // Check: injury not carried forward
        if (prev.physicalCondition === 'injured' &&
            curr.physicalCondition === 'normal' &&
            !curr.timeElapsedSinceLastScene?.includes('week') &&
            !curr.timeElapsedSinceLastScene?.includes('month')) {
          issues.push({
            characterId: charId,
            characterName: character.name,
            type: 'injury-disappeared',
            sceneNumber: curr.sceneNumber,
            detail: `Injury "${prev.injuryDetails}" disappeared without enough time to heal`,
            severity: 'warning',
          });
        }

        // Check: "always worn" accessories missing
        const alwaysWorn = character.accessories
          .filter(a => a.wornWhen === 'always')
          .map(a => a.name);
        const missingAlways = alwaysWorn.filter(a => !curr.activeAccessories.includes(a));
        if (missingAlways.length > 0) {
          issues.push({
            characterId: charId,
            characterName: character.name,
            type: 'always-accessory-missing',
            sceneNumber: curr.sceneNumber,
            detail: `"Always worn" accessories missing: ${missingAlways.join(', ')}`,
            severity: 'error',
          });
        }
      }
    }

    return {
      totalIssues: issues.length,
      errors: issues.filter(i => i.severity === 'error'),
      warnings: issues.filter(i => i.severity === 'warning'),
      issues,
    };
  }

  /**
   * Generate a character reference prompt that's consistent with their current state
   */
  buildCharacterPromptForScene(characterId: string, sceneId: string): string {
    const character = this.characters.get(characterId);
    if (!character) return '';

    const state = this.getCurrentState(characterId);
    const outfit = state
      ? character.outfits.find(o => o.id === state.currentOutfitId) || character.defaultOutfit
      : character.defaultOutfit;

    const app = character.appearance;
    let prompt = '';

    // Core identity (never changes)
    prompt += `${app.age}-year-old ${app.gender}, ${app.ethnicity}, `;
    prompt += `${app.build} build, ${app.height}, `;
    prompt += `${app.skinTone} skin, ${app.hairColor} ${app.hairLength} ${app.hairStyle} hair, `;
    prompt += `${app.eyeColor} eyes`;

    if (app.facialHair) prompt += `, ${app.facialHair}`;
    if (app.distinctiveFeatures.length > 0) {
      prompt += `, ${app.distinctiveFeatures.join(', ')}`;
    }
    prompt += '. ';

    // Current outfit
    prompt += `Wearing: ${outfit.top.color} ${outfit.top.type}`;
    if (outfit.top.material) prompt += ` (${outfit.top.material})`;
    prompt += `, ${outfit.bottom.color} ${outfit.bottom.type}`;
    prompt += `, ${outfit.footwear.color} ${outfit.footwear.type}`;
    if (outfit.outerwear) {
      prompt += `, ${outfit.outerwear.color} ${outfit.outerwear.type}`;
    }
    if (outfit.headwear) {
      prompt += `, ${outfit.headwear.color} ${outfit.headwear.type}`;
    }
    prompt += '. ';

    // Active accessories
    const accessories = state
      ? character.accessories.filter(a => state.activeAccessories.includes(a.name))
      : character.accessories.filter(a => a.wornWhen === 'always');
    if (accessories.length > 0) {
      prompt += `Accessories: ${accessories.map(a => a.description).join(', ')}. `;
    }

    // Physical condition
    if (state?.physicalCondition && state.physicalCondition !== 'normal') {
      prompt += `Physical state: ${state.physicalCondition}`;
      if (state.injuryDetails) prompt += ` (${state.injuryDetails})`;
      prompt += '. ';
    }

    return prompt;
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────

  private selectNextOutfit(character: Character, currentOutfitId: string, scene: Scene): NamedOutfit {
    // Filter out the current outfit — we want a change
    const available = character.outfits.filter(o => o.id !== currentOutfitId);
    if (available.length === 0) return character.outfits[0] || character.defaultOutfit as NamedOutfit;

    // If scene has a specific context, try to match
    // (This would be enhanced with AI in production)
    return available[0];
  }

  private selectAccessories(character: Character, outfit: NamedOutfit, scene: Scene): string[] {
    const accessories: string[] = [];

    for (const acc of character.accessories) {
      if (acc.wornWhen === 'always') {
        accessories.push(acc.name);
      } else if (acc.wornWhen === 'usually') {
        accessories.push(acc.name);  // include by default, can be removed
      }
      // 'sometimes' and 'specific-scenes' are handled by AI or user
    }

    return accessories;
  }

  private parseTimeToHours(timeStr: string): number {
    const lower = timeStr.toLowerCase();
    if (lower.includes('minute')) return 0.5;
    if (lower.includes('hour')) {
      const match = lower.match(/(\d+)/);
      return match ? parseInt(match[1]) : 1;
    }
    if (lower.includes('day') || lower.includes('morning') || lower.includes('next')) return 24;
    if (lower.includes('week')) return 168;
    if (lower.includes('month')) return 720;
    if (lower.includes('year')) return 8760;
    return 0;
  }
}

// ─── REPORT TYPES ────────────────────────────────────────────────────────────

interface ContinuityReport {
  totalIssues: number;
  errors: ContinuityIssue[];
  warnings: ContinuityIssue[];
  issues: ContinuityIssue[];
}

interface ContinuityIssue {
  characterId: string;
  characterName: string;
  type: 'outfit-change-no-time' | 'injury-disappeared' | 'always-accessory-missing' | 'location-impossible';
  sceneNumber: number;
  detail: string;
  severity: 'error' | 'warning';
}

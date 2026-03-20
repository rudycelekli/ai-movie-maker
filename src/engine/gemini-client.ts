// ============================================================================
// GEMINI CLIENT
// Wraps the Google GenAI SDK for image generation using
// Gemini 3 Pro Image Preview (Nano Banana Pro).
// ============================================================================

import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-generate-preview';

export interface ImageGenerationResult {
  base64: string;        // base64-encoded PNG/JPEG
  mimeType: string;      // e.g. "image/png"
  prompt: string;        // the prompt that was used
}

export class GeminiClient {
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!key) {
      throw new Error('Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY in environment');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Generate an image from a text prompt using Gemini Nano Banana Pro.
   * Optionally accepts a reference image to guide generation.
   */
  async generateImage(prompt: string, options: {
    aspectRatio?: string;   // e.g. "1:1", "16:9", "9:16", "3:4", "4:3"
    referenceImage?: { base64: string; mimeType: string };
  } = {}): Promise<ImageGenerationResult> {
    // Build contents — if reference image provided, use multi-part input
    let contents: any;
    if (options.referenceImage) {
      contents = [{
        role: 'user',
        parts: [
          { inlineData: { data: options.referenceImage.base64, mimeType: options.referenceImage.mimeType } },
          { text: `Use the above image as a visual reference to maintain consistency. ${prompt}` },
        ],
      }];
    } else {
      contents = prompt;
    }

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(options.aspectRatio ? {
          imageConfig: {
            aspectRatio: options.aspectRatio,
          },
        } : {}),
      },
    });

    // Extract image from response parts
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        return {
          base64: part.inlineData.data!,
          mimeType: part.inlineData.mimeType || 'image/png',
          prompt,
        };
      }
    }

    throw new Error('Gemini did not return an image. The model may have refused the prompt or returned text only.');
  }

  /**
   * Generate a character reference portrait.
   */
  async generateCharacterReference(character: {
    name: string;
    appearance: Record<string, unknown>;
    defaultOutfit?: Record<string, unknown>;
    referenceImage?: { base64: string; mimeType: string };
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const app = character.appearance || {};

    const features = (app.distinctiveFeatures as string[] || []).join(', ');
    const charType = (app.type as string) || (character as Record<string, unknown>).type as string || 'human';
    const isHuman = !charType || charType === 'human';
    const species = (app.species as string) || (character as Record<string, unknown>).species as string || '';
    const bodyDesc = (app.bodyDescription as string) || '';

    let prompt: string;

    if (isHuman) {
      // PORTRAIT ONLY — close-up headshot, NO outfit, NO body.
      prompt = `Close-up portrait headshot for film production character reference.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, texture, rendering approach) MUST match this style direction.

Character: ${character.name}
Age: ${app.age || 'adult'}, ${app.gender || ''}, ${app.ethnicity || ''}.
Skin: ${app.skinTone || ''}.
Hair: ${app.hairColor || ''} ${app.hairStyle || ''} ${app.hairLength || ''}.
Eyes: ${app.eyeColor || ''}.
${app.facialHair && app.facialHair !== 'none' ? `Facial hair: ${app.facialHair}.` : ''}
${features ? `Distinctive features: ${features}.` : ''}

IMPORTANT: This is a FACE PORTRAIT ONLY — head and shoulders, cropped above the chest. Do NOT show clothing, body, or hands. Focus entirely on the face: skin texture, eye detail, hair, facial structure, expression. Clean neutral background. Studio lighting that reveals facial features clearly. This portrait will be used as a face reference for generating outfit and wardrobe images separately — the face must be sharp, detailed, and highly recognizable. Render in the "${style}" visual style.`;
    } else {
      // Non-human character — full body reference showing the complete design
      prompt = `Character reference sheet for film production.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, texture, rendering approach) MUST match this style direction.

Character: ${character.name}
Type: ${charType}${species ? `, Species: ${species}` : ''}
${bodyDesc ? `Description: ${bodyDesc}` : ''}
${app.skinTone ? `Surface/coloring: ${app.skinTone}.` : ''}
${app.eyeColor ? `Eyes: ${app.eyeColor}.` : ''}
${features ? `Distinctive features: ${features}.` : ''}

IMPORTANT: Show the FULL CHARACTER clearly — this is a reference image that will be used to keep this character visually consistent across all scenes. Clean neutral background. Show the character's complete form, key features, proportions, and distinctive markings/details. Sharp, detailed, highly recognizable. Render in the "${style}" visual style.`;
    }

    return this.generateImage(prompt, { aspectRatio: '1:1', referenceImage: character.referenceImage });
  }

  /**
   * Generate a location/background image.
   */
  async generateLocationBackground(location: {
    name: string;
    type: string;
    description: string;
    interior?: boolean;
    lightingCondition?: string;
    mood?: string;
    colorScheme?: string[];
    keyFeatures?: string[];
    referenceImage?: { base64: string; mimeType: string };
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const colors = (location.colorScheme || []).join(', ');
    const features = (location.keyFeatures || []).join(', ');

    const prompt = `Professional film production background plate. Wide establishing shot.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, atmosphere, rendering approach) MUST match this style direction.

Location: ${location.name}
Type: ${location.type}, ${location.interior ? 'interior' : 'exterior'}.
Description: ${location.description}
Lighting: ${location.lightingCondition || 'natural'}.
Mood: ${location.mood || ''}.
${colors ? `Color palette: ${colors}.` : ''}
${features ? `Key features: ${features}.` : ''}

No people in the shot. Clean background plate for compositing. High resolution, atmospheric depth. Render in the "${style}" visual style.`;

    return this.generateImage(prompt, { aspectRatio: '16:9', referenceImage: location.referenceImage });
  }

  /**
   * Generate an outfit visualization.
   */
  async generateOutfitImage(outfit: {
    characterName: string;
    outfitName: string;
    outfitDescription: string;
    outfitDetails?: Record<string, string>;
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const details = outfit.outfitDetails || {};
    const detailParts = Object.entries(details)
      .filter(([_, v]) => v && v !== 'none')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    const prompt = `Professional costume design reference for film production.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, fabric rendering, aesthetic) MUST match this style direction.

Character: ${outfit.characterName}
Outfit: "${outfit.outfitName}"
Description: ${outfit.outfitDescription}
${detailParts ? `Details: ${detailParts}.` : ''}

Full body view on neutral background showing the complete outfit clearly. Sharp fabric detail, professional lighting. Render in the "${style}" visual style.`;

    return this.generateImage(prompt, { aspectRatio: '3:4' });
  }

  /**
   * Compose a full character image for a specific scene from reference parts.
   * Sends portrait + outfit + accessory references as multi-image input.
   */
  async composeCharacterForScene(params: {
    characterName: string;
    portraitRef: { base64: string; mimeType: string };
    outfitRef?: { base64: string; mimeType: string };
    accessoryRefs?: { name: string; base64: string; mimeType: string }[];
    sceneContext: { title: string; locationName: string; timeOfDay: string; emotionalState: string; action: string };
    pose: string;
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const parts: any[] = [];

    // Portrait reference
    parts.push({ inlineData: { data: params.portraitRef.base64, mimeType: params.portraitRef.mimeType } });
    parts.push({ text: `This is the face and appearance reference for ${params.characterName}. Maintain this exact face, hair, skin tone, and features.` });

    // Outfit reference
    if (params.outfitRef) {
      parts.push({ inlineData: { data: params.outfitRef.base64, mimeType: params.outfitRef.mimeType } });
      parts.push({ text: `This is the outfit ${params.characterName} is wearing in this scene. Use this exact clothing.` });
    }

    // Accessory references
    if (params.accessoryRefs?.length) {
      for (const acc of params.accessoryRefs) {
        parts.push({ inlineData: { data: acc.base64, mimeType: acc.mimeType } });
        parts.push({ text: `This is the accessory "${acc.name}" that ${params.characterName} has in this scene.` });
      }
    }

    // Final composition prompt
    const ctx = params.sceneContext;
    const promptText = `Generate a full-body image of ${params.characterName} wearing this exact outfit${params.accessoryRefs?.length ? ' with these accessories' : ''}.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, atmosphere, rendering) MUST match this style.

Pose: ${params.pose}.
Scene: "${ctx.title}" at ${ctx.locationName}, ${ctx.timeOfDay}.
Emotional state: ${ctx.emotionalState}. Action: ${ctx.action}.
Maintain the exact face and appearance from the portrait reference. Sharp detail, consistent character likeness. Render in the "${style}" visual style.`;
    parts.push({ text: promptText });

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '3:4' },
      },
    });

    const responseParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of responseParts) {
      if (part.inlineData) {
        return {
          base64: part.inlineData.data!,
          mimeType: part.inlineData.mimeType || 'image/png',
          prompt: promptText,
        };
      }
    }
    throw new Error('Gemini did not return an image for character composition.');
  }

  /**
   * Generate a final shot frame from composed character images + location background.
   */
  async generateShotFrame(frame: {
    description: string;
    backgroundDescription: string;
    characters: { name: string; pose: string; expression: string; position: string; action: string }[];
    cameraAngle: string;
    shotSize: string;
  }, references: {
    composedCharacters: { name: string; base64: string; mimeType: string }[];
    locationBackground?: { name: string; base64: string; mimeType: string };
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const parts: any[] = [];

    // Location background reference
    if (references.locationBackground) {
      parts.push({ inlineData: { data: references.locationBackground.base64, mimeType: references.locationBackground.mimeType } });
      parts.push({ text: `This is the background/location: ${references.locationBackground.name}. Use this environment.` });
    }

    // Composed character references
    for (const char of references.composedCharacters) {
      parts.push({ inlineData: { data: char.base64, mimeType: char.mimeType } });
      parts.push({ text: `This is ${char.name} — use their exact appearance, outfit, and features.` });
    }

    // Character positioning details
    const charDesc = frame.characters.map(c =>
      `${c.name}: ${c.position}, ${c.pose}, expression: ${c.expression}, action: ${c.action}`
    ).join('\n');

    const promptText = `Generate a film frame. ${frame.shotSize} shot, camera: ${frame.cameraAngle}.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, composition, atmosphere, rendering) MUST match this style.

Scene: ${frame.description}
Background: ${frame.backgroundDescription}

Characters:
${charDesc}

Maintain exact character appearances from references. Professional composition, consistent with "${style}" visual direction throughout.`;
    parts.push({ text: promptText });

    const response = await this.ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    });

    const responseParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of responseParts) {
      if (part.inlineData) {
        return {
          base64: part.inlineData.data!,
          mimeType: part.inlineData.mimeType || 'image/png',
          prompt: promptText,
        };
      }
    }
    throw new Error('Gemini did not return an image for shot frame.');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VEO 3.1 VIDEO GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start video generation for a shot using Veo 3.1.
   * Supports first/last frame interpolation + up to 3 reference images.
   * Returns the operation object for status polling.
   */
  async startShotVideo(params: {
    prompt: string;
    firstFrame?: { base64: string; mimeType: string };
    lastFrame?: { base64: string; mimeType: string };
    referenceImages?: { base64: string; mimeType: string }[];
    aspectRatio?: string;
    resolution?: string;
  }): Promise<unknown> {
    const config: Record<string, unknown> = {
      aspectRatio: params.aspectRatio || '16:9',
      resolution: params.resolution || '720p',
      personGeneration: 'allow_adult',
    };

    // Last frame for interpolation
    if (params.lastFrame) {
      config.lastFrame = {
        imageBytes: params.lastFrame.base64,
        mimeType: params.lastFrame.mimeType,
      };
    }

    // Reference images (up to 3) for character/location consistency
    if (params.referenceImages?.length) {
      config.referenceImages = params.referenceImages.slice(0, 3).map(ref => ({
        image: {
          imageBytes: ref.base64,
          mimeType: ref.mimeType,
        },
        referenceType: 'asset',
      }));
    }

    const genParams: Record<string, unknown> = {
      model: VEO_MODEL,
      prompt: params.prompt,
      config,
    };

    // First frame as starting image
    if (params.firstFrame) {
      genParams.image = {
        imageBytes: params.firstFrame.base64,
        mimeType: params.firstFrame.mimeType,
      };
    }

    return (this.ai.models as any).generateVideos(genParams);
  }

  /**
   * Poll video generation operation status.
   */
  async checkVideoStatus(operation: unknown): Promise<unknown> {
    return (this.ai.operations as any).getVideosOperation({ operation });
  }

  /**
   * Download completed video to a local file path.
   */
  async downloadVideo(operation: unknown, downloadPath: string): Promise<void> {
    const op = operation as any;
    await (this.ai.files as any).download({
      file: op.response.generatedVideos[0].video,
      downloadPath,
    });
  }
}

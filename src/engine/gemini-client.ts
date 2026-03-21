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

IMPORTANT: This is a FACE PORTRAIT ONLY — head and shoulders, cropped above the chest. Do NOT show clothing, body, or hands. Focus entirely on the face: skin texture, eye detail, hair, facial structure, expression. Clean neutral background. Studio lighting that reveals facial features clearly. This portrait will be used as a face reference for generating outfit and wardrobe images separately — the face must be sharp, detailed, and highly recognizable. Render in the "${style}" visual style.

The portrait must be SHARP, HIGH-RESOLUTION, and HIGHLY DETAILED — this face will be used as the primary identity reference for this character across the entire production. Every freckle, wrinkle, and facial feature must be crystal clear and recognizable.`;
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
   * Generate an outfit visualization on the actual character.
   */
  async generateOutfitImage(outfit: {
    characterName: string;
    outfitName: string;
    outfitDescription: string;
    outfitDetails?: Record<string, string>;
    characterAppearance?: Record<string, unknown>;
    portraitRef?: { base64: string; mimeType: string };
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const details = outfit.outfitDetails || {};
    const detailParts = Object.entries(details)
      .filter(([_, v]) => v && v !== 'none')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    const app = outfit.characterAppearance || {};
    const charDesc = [
      app.age ? `Age: ${app.age}` : '',
      app.gender ? `Gender: ${app.gender}` : '',
      app.ethnicity ? `Ethnicity: ${app.ethnicity}` : '',
      app.height ? `Height: ${app.height}` : '',
      app.build ? `Build: ${app.build}` : '',
      app.skinTone ? `Skin: ${app.skinTone}` : '',
      app.hairColor ? `Hair: ${app.hairColor} ${app.hairStyle || ''} ${app.hairLength || ''}` : '',
    ].filter(Boolean).join(', ');

    const prompt = `Professional costume/wardrobe FLAT LAY reference for film production.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, fabric rendering, aesthetic) MUST match this style direction.

Outfit for character: ${outfit.characterName}
Outfit name: "${outfit.outfitName}"
Description: ${outfit.outfitDescription}
${detailParts ? `Details: ${detailParts}.` : ''}

CRITICAL: Show ONLY the clothing items laid flat or on a mannequin — do NOT show any person, face, or body. This is a wardrobe reference image showing the garments themselves: the top, bottom, footwear, and accessories arranged neatly. Clean neutral background. Sharp fabric detail, professional product photography lighting. Render in the "${style}" visual style.`;

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
    continuityFrame?: { base64: string; mimeType: string };
  }, style: string = 'cinematic'): Promise<ImageGenerationResult> {
    const parts: any[] = [];

    // Continuity frame from previous shot (strongest reference for visual consistency)
    if (references.continuityFrame) {
      parts.push({ inlineData: { data: references.continuityFrame.base64, mimeType: references.continuityFrame.mimeType } });
      parts.push({ text: `CONTINUITY REFERENCE: This is the last frame from the previous shot. The new frame should continue from this moment — maintain the same characters, their exact appearance, clothing, and visual style. The scene flows directly from this image.` });
    }

    // Location background reference
    if (references.locationBackground) {
      parts.push({ inlineData: { data: references.locationBackground.base64, mimeType: references.locationBackground.mimeType } });
      parts.push({ text: `This is the background/location: ${references.locationBackground.name}. Use this environment.` });
    }

    // Composed character references
    for (const char of references.composedCharacters) {
      parts.push({ inlineData: { data: char.base64, mimeType: char.mimeType } });
      parts.push({ text: `This is ${char.name} — use their EXACT appearance, face, outfit, and features. The character must look identical to this reference.` });
    }

    // Character positioning details
    const charDesc = frame.characters.map(c =>
      `${c.name}: ${c.position}, ${c.pose}, expression: ${c.expression}, action: ${c.action}`
    ).join('\n');

    const continuityNote = references.continuityFrame
      ? `\nCONTINUITY: This frame continues directly from the previous shot. Characters must look IDENTICAL to the continuity reference — same face, same body, same clothing, same person. Do not change any character's appearance.`
      : '';

    const promptText = `Generate a film frame. ${frame.shotSize} shot, camera: ${frame.cameraAngle}.

VISUAL STYLE: ${style}
ALL visual choices (lighting, color grading, composition, atmosphere, rendering) MUST match this style.

Scene: ${frame.description}
Background: ${frame.backgroundDescription}

Characters:
${charDesc}
${continuityNote}
ABSOLUTE RULES FOR CHARACTER CONSISTENCY:
- Characters must be recognizably the SAME PERSON across all shots
- Same face structure, same skin tone, same hair color and style, same gender, same age
- Same clothing in every shot within the same scene — never change outfits mid-scene
- Use the provided character reference images as the GROUND TRUTH for appearance

CINEMATIC QUALITY:
- Stunning composition with dramatic lighting and depth
- Include atmospheric details: dust particles, lens flares, ambient haze, reflections
- Professional film production quality — every frame should look like a movie still
- Visually breathtaking. Render in the "${style}" visual direction throughout.`;
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
    const hasImage = !!params.firstFrame;
    const hasRefs = params.referenceImages && params.referenceImages.length > 0;

    // Per Veo 3.1 docs:
    // - text-to-video: personGeneration must be "allow_all"
    // - image-to-video / reference images: personGeneration must be "allow_adult"
    const config: Record<string, unknown> = {
      aspectRatio: params.aspectRatio || '16:9',
      personGeneration: (hasImage || hasRefs) ? 'allow_adult' : 'allow_all',
    };

    // Last frame for interpolation (must be used with firstFrame)
    if (params.lastFrame && hasImage) {
      config.lastFrame = {
        imageBytes: params.lastFrame.base64,
        mimeType: params.lastFrame.mimeType,
      };
    }

    // Reference images (up to 3) for character/location consistency
    // Format per docs: { image: { imageBytes, mimeType }, referenceType: "asset" }
    if (hasRefs) {
      config.referenceImages = params.referenceImages!.slice(0, 3).map(ref => ({
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

    // First frame as starting image (top-level "image" parameter)
    if (hasImage) {
      genParams.image = {
        imageBytes: params.firstFrame!.base64,
        mimeType: params.firstFrame!.mimeType,
      };
    }

    console.log(`Starting video generation: ${hasImage ? 'image-to-video' : 'text-to-video'}, refs: ${params.referenceImages?.length || 0}, aspect: ${config.aspectRatio}`);

    try {
      return await (this.ai.models as any).generateVideos(genParams);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Video generation failed:', msg);

      // If it fails with references/lastFrame, retry without them
      if (msg.includes('INVALID_ARGUMENT') || msg.includes('Unsupported')) {
        console.log('Retrying with simpler config...');
        delete config.referenceImages;
        delete config.lastFrame;
        config.personGeneration = hasImage ? 'allow_adult' : 'allow_all';

        try {
          return await (this.ai.models as any).generateVideos(genParams);
        } catch (err2: unknown) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          console.error('Retry also failed:', msg2);

          // Final fallback: text-only, no image
          if (hasImage && (msg2.includes('INVALID_ARGUMENT') || msg2.includes('Unsupported'))) {
            console.log('Final fallback: text-to-video only...');
            return await (this.ai.models as any).generateVideos({
              model: VEO_MODEL,
              prompt: params.prompt,
              config: {
                aspectRatio: params.aspectRatio || '16:9',
                personGeneration: 'allow_all',
              },
            });
          }
          throw err2;
        }
      }
      throw err;
    }
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

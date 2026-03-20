// ============================================================================
// ANTHROPIC CLIENT
// Wraps the Claude API for all script generation, scene planning, and
// creative decisions in the movie maker pipeline.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5-20250929';  // fast + smart for iteration
const MODEL_PREMIUM = 'claude-sonnet-4-5-20250929'; // use sonnet for cost efficiency, upgrade to opus for final

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      timeout: 120_000, // 2 minute timeout — fail fast, don't hang
    });
  }

  /**
   * Generate structured JSON output from Claude
   */
  async generateJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    premium: boolean = false,
  ): Promise<T> {
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await this.client.messages.create({
        model: premium ? MODEL_PREMIUM : MODEL,
        max_tokens: 16384,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt + '\n\nRespond ONLY with valid JSON. No markdown, no explanation, just the JSON object. Keep responses concise — focus on essential details.',
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      // If response was truncated, retry with stronger instruction
      if (response.stop_reason === 'max_tokens' && attempt < maxRetries) {
        console.log(`  ⚠ Response truncated (attempt ${attempt + 1}), retrying with shorter output...`);
        continue;
      }

      // Extract JSON from response (handle potential markdown wrapping)
      const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

      try {
        return JSON.parse(jsonStr) as T;
      } catch (e) {
        if (response.stop_reason === 'max_tokens') {
          throw new Error('Claude response was too long and got cut off. Try a simpler concept or fewer characters.');
        }
        throw new Error(`Failed to parse Claude response as JSON:\n${jsonStr.slice(0, 500)}`);
      }
    }

    throw new Error('Failed to generate valid JSON after retries');
  }

  /**
   * Generate creative text (non-JSON) from Claude
   */
  async generateText(
    systemPrompt: string,
    userPrompt: string,
    premium: boolean = false,
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: premium ? MODEL_PREMIUM : MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  /**
   * Kid mode safety check — runs content through Claude for review
   */
  async kidModeSafetyCheck(content: string, ageRange: string): Promise<{
    safe: boolean;
    issues: string[];
    rewrittenContent?: string;
  }> {
    return this.generateJSON(
      'You are a child content safety reviewer. Be strict but not overly restrictive.',
      `Review this content for a ${ageRange} audience (ages ${ageRange === 'toddler' ? '2-5' : ageRange === 'kids' ? '6-9' : '10-12'}).

CONTENT:
${content}

Check for: violence, scary content, inappropriate language, romantic/sexual content, drug/alcohol references, overly complex/dark themes.

Return JSON:
{
  "safe": true/false,
  "issues": ["list of specific issues found"],
  "rewrittenContent": "safe version if not safe, or null if safe"
}`
    );
  }
}

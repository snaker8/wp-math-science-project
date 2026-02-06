// ============================================================================
// OpenAI API Utilities for Supabase Edge Functions
// ============================================================================

import { OpenAIMessage, OpenAIResponse } from './types.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export interface CallOpenAIOptions {
  messages: OpenAIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' } | { type: 'text' };
}

export async function callOpenAI(
  apiKey: string,
  options: CallOpenAIOptions
): Promise<OpenAIResponse> {
  const {
    messages,
    model = 'gpt-4o',
    temperature = 0.7,
    maxTokens = 2048,
    responseFormat,
  } = options;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
  }

  return response.json();
}

export function parseJSONResponse<T>(content: string): T {
  // Try to extract JSON from markdown code blocks if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();

  return JSON.parse(jsonString);
}

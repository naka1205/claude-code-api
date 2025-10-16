/**
 * Gemini API Type Definitions
 * Based on official Gemini API documentation
 */

// ============= Request Types =============

export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

export type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFileDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart
  | GeminiThoughtPart;

export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiFileDataPart {
  fileData: {
    mimeType: string;
    fileUri: string;
  };
}

export interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, any>;
  };
}

export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, any>;
  };
}

export interface GeminiThoughtPart {
  thought: {
    content: string;
    redacted?: boolean;
  };
  thoughtSignature?: string;
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export type GeminiToolConfig =
  | { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE' } }
  | {
      functionCallingConfig: {
        mode: 'ANY';
        allowedFunctionNames: string[];
      };
    };

export interface GeminiThinkingConfig {
  thinkingBudget?: number;
}

export interface GeminiSafetySettings {
  category: string;
  threshold: string;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: Record<string, any>;
  thinkingConfig?: GeminiThinkingConfig;
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  safetySettings?: GeminiSafetySettings[];
  generationConfig?: GeminiGenerationConfig;
}

// ============= Response Types =============

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount?: number;
}

export type GeminiFinishReason =
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'OTHER'
  | 'BLOCKLIST'
  | 'PROHIBITED_CONTENT'
  | 'SPII';

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: GeminiFinishReason;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
  citationMetadata?: {
    citationSources: Array<{
      startIndex?: number;
      endIndex?: number;
      uri?: string;
      license?: string;
    }>;
  };
}

export interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  };
}

// ============= Streaming Types =============

export interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    blockReason?: string;
  };
}

// ============= Token Counting Types =============

export interface GeminiCountTokensRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
}

export interface GeminiCountTokensResponse {
  totalTokens: number;
  cachedContentTokenCount?: number;
}

// ============= Error Types =============

export interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      '@type': string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
    }>;
  };
}

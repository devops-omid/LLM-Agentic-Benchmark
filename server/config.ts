import dotenv from 'dotenv';
import { BenchmarkModel } from './types.js';

dotenv.config();

export const NVIDIA_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export const SUPPORTED_MODELS: BenchmarkModel[] = [
  {
    id: 'meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision Instruct',
    provider: 'nvidia_nim',
    contextLimit: 131072,
    description: 'Fast, cost-effective multimodal model on NVIDIA NIM. High streaming TPS, low latency, and verified active access.',
    recommendedConcurrency: 16,
    parameterSize: '11B (Fast & Cheap NIM)'
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'google_gemini',
    contextLimit: 1048576,
    description: 'The least expensive Gemini model. Ultra-low cost ($0.075/1M input tokens, $0.01875 cached), high TPS, 1M context window.',
    recommendedConcurrency: 24,
    parameterSize: 'Flash-Lite (Lowest Cost Gemini)'
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    provider: 'google_gemini',
    contextLimit: 1048576,
    description: 'Ultra-low latency compact Gemini model optimized for high-volume agentic pipelines and tool calling.',
    recommendedConcurrency: 24,
    parameterSize: 'Flash-Lite 3.1'
  },
  {
    id: 'meta/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B Instruct',
    provider: 'nvidia_nim',
    contextLimit: 131072,
    description: 'Enterprise open-weight reasoning model on NVIDIA NIM for high-complexity agentic tasks.',
    recommendedConcurrency: 12,
    parameterSize: '70B Heavyweight'
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B Instruct',
    provider: 'nvidia_nim',
    contextLimit: 131072,
    description: 'Compact 8B model baseline for high-throughput concurrency stress tests.',
    recommendedConcurrency: 24,
    parameterSize: '8B Compact'
  }
];

export const CONTEXT_WINDOW_OPTIONS = [
  { value: 0, label: '0 (Empty Context)' },
  { value: 4096, label: '4K (4,096 tokens)' },
  { value: 8192, label: '8K (8,192 tokens)' },
  { value: 16384, label: '16K (16,384 tokens)' },
  { value: 32768, label: '32K (32,768 tokens)' },
  { value: 65536, label: '64K (65,536 tokens)' },
  { value: 131072, label: '128K (131,072 tokens)' },
  { value: 262144, label: '256K (262,144 tokens)' },
];

export const WORKLOAD_PRESETS = [
  {
    id: 'ladder_sequential_16k',
    name: 'Sequential Context Ladder (0 → 64K, 16K Steps)',
    description: 'Chains benchmarks in sequence: 0, 16k, 32k, 48k, 64k tokens. Reuses previous context to leverage KV-cache prefix hits.',
    promptTokens: 16384,
    targetOutputTokens: 256,
    concurrency: 4,
    totalRequests: 5,
    systemPromptPreset: 'doc_reasoning' as const,
    isSequentialLadder: true,
    ladderSteps: [0, 16384, 32768, 49152, 65536],
    enableKvCacheReuse: true,
  },
  {
    id: 'ladder_exponential_256k',
    name: 'Full Scale Deep Context (0 → 256K Exponential)',
    description: 'Measures latency and KV-cache scaling across 0, 4k, 8k, 16k, 32k, 64k, 128k, up to 256k context depth.',
    promptTokens: 32768,
    targetOutputTokens: 256,
    concurrency: 2,
    totalRequests: 8,
    systemPromptPreset: 'agentic_tool' as const,
    isSequentialLadder: true,
    ladderSteps: [0, 4096, 8192, 16384, 32768, 65536, 131072, 262144],
    enableKvCacheReuse: true,
  },
  {
    id: 'agentic_reasoning',
    name: 'Agentic Tool Calling (16K Context)',
    description: 'Simulates multi-turn agent with tool signatures, memory logs, and planning tokens.',
    promptTokens: 16384,
    targetOutputTokens: 512,
    concurrency: 8,
    totalRequests: 16,
    systemPromptPreset: 'agentic_tool' as const,
    isSequentialLadder: false,
    enableKvCacheReuse: true,
  },
  {
    id: 'fast_chat',
    name: 'Zero-Context Snappy Chat (0 Tokens TTFT Focus)',
    description: 'Measures raw edge responsiveness and zero-prefill interactive TTFT and token generation.',
    promptTokens: 0,
    targetOutputTokens: 128,
    concurrency: 16,
    totalRequests: 32,
    systemPromptPreset: 'general' as const,
    isSequentialLadder: false,
    enableKvCacheReuse: false,
  },
  {
    id: 'stress_test',
    name: 'High Concurrency Stress Test',
    description: 'Pushes server queue and GPU tensor parallelism with sustained parallel streams.',
    promptTokens: 8192,
    targetOutputTokens: 256,
    concurrency: 24,
    totalRequests: 48,
    systemPromptPreset: 'doc_reasoning' as const,
    isSequentialLadder: false,
    enableKvCacheReuse: true,
  },
];

/**
 * Deterministic, sequential block generator for KV-cache reuse.
 * Produces structured data segments (system state records, memory checkpoints, code graphs).
 * When context grows from 0 -> 16K -> 32K -> 48K, the initial chunks are 100% byte-for-byte identical,
 * enabling modern inference engines (NVIDIA NIM RadixAttention/vLLM & Gemini prompt caching)
 * to hit the cached KV-cache blocks without recomputing prefill!
 */
export function generatePromptPayload(tokens: number, preset: string = 'general'): { system: string; user: string } {
  let system = 'You are an autonomous high-performance AI agent executing complex reasoning tasks.';
  if (preset === 'agentic_tool') {
    system = 'You are an agentic planning system. Read tool declarations, evaluate parameters, formulate multi-step plans, and generate concise structured tool call arguments in JSON.';
  } else if (preset === 'code_synthesis') {
    system = 'You are an expert systems software engineer. Analyze architecture specs, identify concurrency bottlenecks, and write clean, typed, zero-overhead implementation code.';
  } else if (preset === 'doc_reasoning') {
    system = 'You are a research analyst. Extract key metrics, calculate statistical variance, and synthesize findings into an executive briefing.';
  }

  // 0 Tokens: Empty context benchmark mode (measures raw model responsiveness)
  if (tokens <= 0) {
    const user = `TASK: Low-latency ping execution.\nINSTRUCTION: Confirm readiness and output benchmark verification token stream.`;
    return { system, user };
  }

  // Target character budget (~4 chars per token)
  const targetChars = tokens * 4;
  const baseTask = `TASK: Benchmark streaming inference performance and token throughput under calibrated context payload of ${tokens.toLocaleString()} tokens.\n`;
  
  // Deterministic numbered knowledge blocks for stable KV cache prefix hashing
  let contextBody = '--- BEGIN KNOWLEDGE BASE CONTEXT ARCHIVE ---\n';
  let blockIndex = 1;

  while (contextBody.length < targetChars) {
    const blockSnippet = `[DATA BLOCK #${String(blockIndex).padStart(4, '0')} - KV-REUSE-ANCHOR]: Sensor packet matrix ID_${blockIndex}9420. System vector states: alpha=0.${(blockIndex * 13) % 9999} beta=1.${(blockIndex * 17) % 9999} gamma=4.${(blockIndex * 19) % 9999}. Execution thread affinity validated with CRC32: ${((blockIndex * 9973) ^ 0xabcdef).toString(16)}. Memory checkpoint reference #${blockIndex}: Transaction nominal, pipeline state cached, prefill delta synchronized. `;
    contextBody += blockSnippet;
    blockIndex++;
  }

  if (contextBody.length > targetChars) {
    contextBody = contextBody.slice(0, targetChars) + '\n--- END KNOWLEDGE BASE CONTEXT ARCHIVE ---';
  } else {
    contextBody += '\n--- END KNOWLEDGE BASE CONTEXT ARCHIVE ---';
  }

  const user = `${baseTask}\n${contextBody}\n\nINSTRUCTION: Synthesize key findings from the context above and emit structured streaming latency metrics.`;

  return { system, user };
}

export function getServerEnvConfig() {
  const nvidiaKey = process.env.NVIDIA_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const hasNvidiaKey = Boolean(nvidiaKey && nvidiaKey !== 'MY_NVIDIA_API_KEY');
  const hasGeminiKey = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

  return {
    hasNvidiaKey,
    hasGeminiKey,
    nvidiaBaseUrl: NVIDIA_NIM_BASE_URL,
    defaultModel: 'meta/llama-3.2-11b-vision-instruct',
  };
}

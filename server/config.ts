import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import dotenv from 'dotenv';
import { BenchmarkModel, WorkloadPreset, ContextWindowOption } from './types.js';

dotenv.config();

const configPath = fs.existsSync(path.resolve(process.cwd(), 'config.yaml'))
  ? path.resolve(process.cwd(), 'config.yaml')
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../config.yaml');
const parsed = yaml.parse(fs.readFileSync(configPath, 'utf8'));

export const NVIDIA_NIM_BASE_URL: string = parsed.server?.nvidiaNimBaseUrl || 'https://integrate.api.nvidia.com/v1';
export const HYPERQWEN_BASE_URL: string = process.env.HYPERQWEN_BASE_URL || parsed.server?.hyperqwenBaseUrl || 'http://192.168.1.110:18020/v1';
export const DEFAULT_MODEL_FALLBACK: string = parsed.server?.defaultModelFallback || 'meta/llama-3.2-11b-vision-instruct';
export const DEFAULT_HYPERQWEN_MODEL: string = parsed.server?.defaultHyperqwenModel || 'qwen3.8-27b';

export const SUPPORTED_MODELS: BenchmarkModel[] = parsed.models || [];
export const CONTEXT_WINDOW_OPTIONS: ContextWindowOption[] = parsed.contextWindowOptions || [];
export const WORKLOAD_PRESETS: WorkloadPreset[] = parsed.workloadPresets || [];

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
  const hyperqwenKey = process.env.HYPERQWEN_API_KEY || '';
  const hasNvidiaKey = Boolean(nvidiaKey && nvidiaKey !== 'MY_NVIDIA_API_KEY');
  const hasGeminiKey = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');
  const hasHyperqwenKey = Boolean(hyperqwenKey && hyperqwenKey !== 'MY_HYPERQWEN_API_KEY');

  return {
    hasNvidiaKey,
    hasGeminiKey,
    hasHyperqwenKey,
    nvidiaBaseUrl: NVIDIA_NIM_BASE_URL,
    hyperqwenBaseUrl: HYPERQWEN_BASE_URL,
    defaultModel: hasHyperqwenKey ? DEFAULT_HYPERQWEN_MODEL : DEFAULT_MODEL_FALLBACK,
  };
}

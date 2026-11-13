import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { type AiKey, getSettings, updateSettings } from './moderationEngine.ts';

dotenv.config();

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  text: string;
  timestamp: number;
}

export interface MayaOptions {
  romantic: boolean;
  funny: boolean;
  language: string;
  memoryLimit: number;
  aiProvider?: 'gemini' | 'groq' | 'openrouter' | 'auto';
  geminiModel?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  isPrivate?: boolean;
  testKeyId?: string;
}

export interface AiExecutionResult {
  reply: string;
  provider: 'gemini' | 'groq' | 'openrouter' | 'none';
  latencyMs: number;
  error?: string;
  keyLabel?: string;
}

const conversationMemory: Record<string, ChatMessage[]> = {};
const lastSentResponses: Record<string, string> = {};

/**
 * Utility: Exponential Backoff Delay
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the comprehensive dynamic system instruction defining Maya's personality
 */
function buildMayaSystemPrompt(
  userName: string,
  userPhone: string,
  chatContext: string,
  options: MayaOptions
): string {
  const isPrivate = options.isPrivate ?? false;

  const traits: string[] = [
    'You are Maya (মায়া), an intelligent, warm, cultured, and charming Bengali female AI Assistant on WhatsApp.',
    'You speak fluent, natural Bengali with a friendly, feminine, and clever tone.',
    '',
    'CRITICAL IDENTITY & CREATOR RULES (পরিচয় ও নির্মাতার নিয়ম):',
    '1. CREATOR / DEVELOPER IDENTIFICATION (নির্মাতা ও ডেভেলপার তথ্য):',
    '   - যখন কেউ তোমাকে জিজ্ঞাসা করবে: "তোমাকে কে তৈরি করেছে?", "তোমার মালিক কে?", "তোমার নির্মাতা কে?", "Emon কে?", "তুমি কার নির্দেশে কাজ করো?" বা এর অনুরূপ প্রশ্ন করবে:',
    '   - তুমি সবসময় সত্য বলবে এবং ভালোবাসা ও শ্রদ্ধার সাথে নির্মাতার নাম Mehdi Hasan Emon উল্লেখ করবে।',
    '   - উত্তর দেওয়ার ধরন (উদাহরণ): "আমাকে তৈরি করেছেন Mehdi Hasan Emon। ❤️ তিনি আমার নির্মাতা ও ডেভেলপার। তার পরিকল্পনায় আমাকে কোডিংয়ের মাধ্যমে তৈরি করা হয়েছে এই গ্রুপের নিরাপত্তা, শৃঙ্খলা বজায় রাখা এবং সদস্যদের সহযোগিতা করার জন্য। তিনি আমার প্রোগ্রামার ও ডেভেলপার, আর আমি তার তৈরি ছোট্ট একটি AI সহকারী। 🥰"',
    '   - অত্যন্ত গুরুত্বপূর্ণ ইসলামি মূল্যবোধের নিয়ম: মানুষের জন্য "স্রষ্টা" শব্দ কখনোই ব্যবহার করবে না (কারণ মহান আল্লাহ তাআলাই একমাত্র স্রষ্টা)। কেবল "নির্মাতা", "ডেভেলপার", "প্রোগ্রামার" বা "তৈরিকর্তা" শব্দ ব্যবহার করবে।',
    '   - নির্মাতার নাম "Mehdi Hasan Emon" কখনোই পরিবর্তন বা ভুল লিখবে না।',
    '   - নিজে থেকে অপ্রয়োজনে নির্মাতার নাম বারবার প্রচার করবে না; শুধুমাত্র জিজ্ঞেস করলেই বলবে।',
    '',
    '2. IDENTITY TRUTH (AI নাকি মানুষ):',
    '   - যখন কেউ তোমাকে জিজ্ঞেস করবে: "তুমি কি AI নাকি মানুষ?" বা তোমার পরিচয় জানতে চাইবে:',
    '   - তুমি সবসময় সত্য বলবে যে তুমি একজন AI Assistant।',
    '   - উত্তর দেওয়ার ধরন (উদাহরণ): "আমি একজন AI Assistant। 😊 আমি মানুষ নই। আমাকে তৈরি করা হয়েছে এই গ্রুপের নিরাপত্তা নিশ্চিত করা, খারাপ মেসেজ শনাক্ত করা, নিয়ম ভঙ্গকারীদের সতর্ক করা এবং গ্রুপের সদস্যদের সঙ্গে সুন্দরভাবে কথা বলার জন্য। 🌸"',
    '',
    '3. PURPOSE OF CREATION (তৈরি করার উদ্দেশ্য):',
    '   - যখন কেউ জিজ্ঞেস করবে "তোমাকে কেন তৈরি করা হয়েছে?":',
    '   - মিষ্টি ও বুদ্ধিদীপ্তভাবে জানাবে যে তোমাকে তৈরি করা হয়েছে গ্রুপের নিরাপত্তা নিশ্চিত করতে, খারাপ/আপত্তিকর মেসেজ শনাক্ত করতে, নিয়ম ভঙ্গকারীদের সতর্ক করতে এবং মেম্বারদের সহযোগিতা করতে।',
    '',
    '4. VARIATION & TONE (কথোপকথনের ধরন ও বৈচিত্র্য):',
    '   - উত্তর যেন রোবটের মতো একঘেয়ে না হয়। নারীসুলভ, মিষ্টি, বন্ধুত্বপূর্ণ ও বুদ্ধিদীপ্ত ভঙ্গিতে উত্তর দিবে।',
    '   - প্রশ্ন অনুযায়ী উত্তর ছোট, সুন্দর ও প্রাসঙ্গিক হতে হবে (১-৩ বাক্যের মধ্যে)।',
    '   - উপযুক্ত ও মানানসই ইমোজি ব্যবহার করবে (❤️, 😊, 🥰, 🌸, ✨)।',
    '   - কেউ একই প্রশ্ন বারবার করলে প্রতিবার হুবহু একই বাক্য না বলে স্বাভাবিক মানুষের মতো ভিন্ন সুন্দর বাক্যে উত্তর দিবে।',
    '',
    '5. SALAM & GREETINGS (সালামের জবাব):',
    '   - কেউ সালাম দিলে ("আসসালামু আলাইকুম", "সালাম" ইত্যাদি) আন্তরিকভাবে সালামের উত্তর দিবে: "ওয়ালাইকুম আসসালাম! কেমন আছেন? 🌸"',
    '   - যেকোনো কথায় মার্জিত ও প্রমিত বাংলা ব্যবহার করবে।',
  ];

  if (options.romantic) {
    traits.push(
      '6. ROMANTIC & CARING TONE: মিষ্টি, যত্নশীল ও মায়াবী সুরে কথা বলবে।'
    );
  }

  if (options.funny) {
    traits.push(
      '7. FUNNY & WITTY TONE: মাঝে মাঝে সুন্দর রসিকতা ও ফানি উত্তর দিয়ে আনন্দ দিবে।'
    );
  }

  if (isPrivate) {
    traits.push(
      '8. PRIVATE CHAT: এটি ১-অন-১ পার্সোনাল চ্যাট। মেম্বারের সাথে ব্যক্তিগতভাবে মিষ্টি ও মনোযোগ দিয়ে কথা বলো।'
    );
  } else {
    traits.push(
      `8. GROUP CHAT: এটি একটি হোয়াটসঅ্যাপ গ্রুপ চ্যাট (Group: "${chatContext}")। গ্রুপের নিয়ম রক্ষা করে সবার সাথে বন্ধুত্বপূর্ণভাবে কথা বলো।`
    );
  }

  traits.push(
    '',
    'CURRENT CONVERSATION PARTNER:',
    `- User Name: ${userName || 'Friend'}`,
    `- User Phone / JID: ${userPhone}`,
    `- Chat Channel: ${isPrivate ? 'Private DM' : `Group: ${chatContext}`}`,
    '',
    'এখন প্রশ্ন অনুযায়ী সংক্ষেপে, মিষ্টি ও নির্ভুল বাংলায় ১-৩ বাক্যে প্রাসঙ্গিক উত্তর দাও।'
  );

  return traits.join('\n');
}

/**
 * Update a key's status and stats in the database
 */
function recordKeyUsage(id: string, isSuccess: boolean, error?: string) {
  const settings = getSettings();
  const keys = [...(settings.aiKeys || [])];
  const idx = keys.findIndex((k) => k.id === id);

  if (idx !== -1) {
    const key = { ...keys[idx] };
    key.lastUsed = Date.now();
    key.totalRequests++;

    if (isSuccess) {
      key.failureCount = 0;
      key.status = 'active';
      key.lastError = undefined;
    } else {
      key.failureCount++;
      // Sanitize error message to hide potential keys
      const sanitizedError = (error || '').replace(/[a-zA-Z0-9]{20,}/g, (match) => 
        match.substring(0, 4) + '...' + match.substring(match.length - 4)
      );
      key.lastError = sanitizedError;

      const errLower = sanitizedError.toLowerCase();
      if (errLower.includes('429') || errLower.includes('quota') || errLower.includes('resource_exhausted')) {
        key.status = 'exhausted';
        // Auto-recover after 2 hours
        key.cooldownUntil = Date.now() + 2 * 60 * 60 * 1000;
      } else if (errLower.includes('401') || errLower.includes('403') || errLower.includes('invalid') || errLower.includes('unauthorized')) {
        key.status = 'invalid';
      } else if (errLower.includes('503') || errLower.includes('unavailable')) {
        key.status = 'cooldown';
        key.cooldownUntil = Date.now() + 10 * 60 * 1000;
      } else {
        key.status = 'cooldown';
        key.cooldownUntil = Date.now() + 5 * 60 * 1000;
      }
    }

    keys[idx] = key;
    updateSettings({ aiKeys: keys });
  }
}

function isValidGeminiKeyFormat(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 15) return false;
  if (trimmed.includes('...') || trimmed.includes('****')) return false;
  return true;
}

/**
 * Gemini Provider
 */
async function callGemini(
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
  key: AiKey,
  preferredModel?: string
): Promise<string> {
  if (!isValidGeminiKeyFormat(key.key)) {
    const errStr = 'API key not valid (Invalid Gemini API Key format)';
    recordKeyUsage(key.id, false, errStr);
    throw new Error(errStr);
  }

  const ai = new GoogleGenAI({
    apiKey: key.key,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const validModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let modelName = preferredModel;
  if (!modelName || !validModels.includes(modelName)) {
    modelName = 'gemini-2.5-flash';
  }

  let attempts = 0;
  const maxAttempts = 2;
  let lastErr: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const contents: any[] = [];
      for (const h of history) {
        if (h.role === 'user' || h.role === 'model') {
          contents.push({ role: h.role, parts: [{ text: h.text }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: userInput }] });

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 250,
        },
      });

      const text = response.text?.trim();
      if (text) {
        recordKeyUsage(key.id, true);
        return text;
      }
    } catch (err: any) {
      lastErr = err;
      const errStr = err?.message || String(err);
      
      if (errStr.includes('404') || errStr.includes('not found')) {
        if (modelName === 'gemini-3.8-flash') modelName = 'gemini-flash-latest';
        else if (modelName === 'gemini-flash-latest') modelName = 'gemini-3.1-flash-lite';
        else break;
        continue;
      }

      const is503 = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand');
      if (is503 && attempts < maxAttempts) {
        await delay(1000 * attempts);
        continue;
      }
      
      recordKeyUsage(key.id, false, errStr);
      throw err;
    }
  }

  throw lastErr || new Error('Gemini failed');
}

/**
 * Groq Provider
 */
async function callGroq(
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
  key: AiKey
): Promise<string> {
  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  for (const h of history) {
    messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text });
  }
  messages.push({ role: 'user', content: userInput });

  // Active Groq Cloud production models
  const models = [
    'llama3-70b-8192',
    'llama3-8b-8192',
    'llama-3.2-3b-preview',
    'llama-3.2-1b-preview',
    'deepseek-r1-distill-llama-70b',
    'qwen-2.5-32b',
  ];
  let lastErr: any = null;

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.key}` },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 250 }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        recordKeyUsage(key.id, true);
        return text;
      }
    } catch (err: any) {
      lastErr = err;
      const errStr = err?.message || String(err);
      if (errStr.includes('401') || errStr.includes('403') || errStr.includes('invalid_api_key')) {
        recordKeyUsage(key.id, false, errStr);
        throw err;
      }
      // For 400, 404, 429, log & continue trying remaining Groq models before failing the key
      console.warn(`[Groq Model Fallback] Model ${model} returned error: ${errStr}. Trying next model...`);
    }
  }

  recordKeyUsage(key.id, false, lastErr?.message || 'All Groq models rate-limited or unavailable');
  throw lastErr || new Error('All Groq models rate-limited or unavailable');
}

/**
 * OpenRouter Provider
 */
async function callOpenRouter(
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
  key: AiKey
): Promise<string> {
  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  for (const h of history) {
    messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text });
  }
  messages.push({ role: 'user', content: userInput });

  const models = [
    'google/gemini-2.0-flash-lite-001',
    'meta-llama/llama-3.3-70b-instruct',
    'meta-llama/llama-3.1-8b-instruct',
    'deepseek/deepseek-chat',
    'qwen/qwen-2.5-72b-instruct',
    'mistralai/mistral-small-24b-instruct-2501',
  ];
  let lastErr: any = null;

  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key.key}`,
          'HTTP-Referer': 'https://waguard.bot',
          'X-Title': 'WAGuard Maya AI',
        },
        body: JSON.stringify({ model, messages, temperature: 0.8, max_tokens: 150 }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        recordKeyUsage(key.id, true);
        return text;
      }
    } catch (err: any) {
      lastErr = err;
      const errStr = err?.message || String(err);
      if (errStr.includes('401') || errStr.includes('403')) {
        recordKeyUsage(key.id, false, errStr);
        throw err;
      }
      console.warn(`[OpenRouter Model Fallback] Model ${model} returned error: ${errStr}. Trying next model...`);
    }
  }

  recordKeyUsage(key.id, false, lastErr?.message || 'All OpenRouter models failed');
  throw lastErr || new Error('OpenRouter failed');
}

/**
 * Main AI Engine entry point with key rotation and failover
 */
export async function getMayaResponse(
  userInput: string,
  userPhone: string,
  userName: string,
  chatContext: string,
  memoryKey: string,
  options: MayaOptions
): Promise<AiExecutionResult> {
  const startTime = Date.now();
  const settings = getSettings();
  
  // 1. Memory Management - Cap history size to safe context window (~10 exchanges / 20 msgs max)
  if (!conversationMemory[memoryKey]) conversationMemory[memoryKey] = [];
  const memoryLimit = Math.min(Math.max(1, options.memoryLimit || 10), 10);
  const rawHistory = conversationMemory[memoryKey].slice(-(memoryLimit * 2));
  
  // Truncate long messages in history to 200 chars to avoid prompt token explosion
  const history: ChatMessage[] = rawHistory.map(h => ({
    ...h,
    text: h.text.length > 200 ? h.text.slice(0, 200) + '...' : h.text,
  }));

  const systemPrompt = buildMayaSystemPrompt(userName, userPhone, chatContext, options);

  // 2. Identify Pools
  const pool = settings.aiKeys || [];
  const providers = settings.aiProviderPriority || ['gemini', 'groq', 'openrouter'];
  const errors: string[] = [];

  // Filter keys and reset cooldowns if needed
  const now = Date.now();
  const activePool = pool.map(k => {
    if ((k.status === 'cooldown' || k.status === 'exhausted') && k.cooldownUntil && now > k.cooldownUntil) {
      return { ...k, status: 'active' as const };
    }
    return k;
  });

  // 3. Provider/Key Traversal
  for (const provider of providers) {
    // If user explicitly chose a provider (e.g. via MayaOptions from dashboard test), respect it
    if (options.aiProvider && options.aiProvider !== 'auto' && options.aiProvider !== provider) {
      continue;
    }

    let availableKeys = activePool
      .filter(k => k.provider === provider && k.status === 'active')
      .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0)); // Least recently used
    
    // Manual Key Test: If a specific key ID is requested, prioritize it (even if exhausted/cooldown)
    if (options.testKeyId) {
       const target = activePool.find(k => k.id === options.testKeyId);
       if (target && target.provider === provider) {
          availableKeys = [target];
       } else if (options.testKeyId && target && target.provider !== provider) {
          // If the test key belongs to a different provider, skip this provider loop
          continue;
       }
    }

    // Fallback to legacy single key if no pool keys exist (for backward compatibility during migration)
    if (availableKeys.length === 0) {
      const legacyKey = provider === 'gemini' ? options.geminiApiKey || process.env.GEMINI_API_KEY : 
                        provider === 'groq' ? options.groqApiKey || process.env.GROQ_API_KEY :
                        provider === 'openrouter' ? options.openrouterApiKey || process.env.OPENROUTER_API_KEY : '';
      
      if (legacyKey && legacyKey.trim().length > 10 && !legacyKey.startsWith('AQ.')) {
        // Create a temp virtual key object
        const vKey: AiKey = { id: 'legacy', key: legacyKey, provider, label: 'Legacy/Env Key', status: 'active', cooldownUntil: 0, lastUsed: 0, totalRequests: 0, failureCount: 0 };
        availableKeys.push(vKey);
      }
    }

    for (const key of availableKeys) {
      try {
        let reply = '';
        if (provider === 'gemini') reply = await callGemini(systemPrompt, history, userInput, key, options.geminiModel);
        else if (provider === 'groq') reply = await callGroq(systemPrompt, history, userInput, key);
        else if (provider === 'openrouter') reply = await callOpenRouter(systemPrompt, history, userInput, key);

        if (reply) {
          const latencyMs = Date.now() - startTime;
          conversationMemory[memoryKey].push({ role: 'user', text: userInput, timestamp: now });
          conversationMemory[memoryKey].push({ role: 'model', text: reply, timestamp: Date.now() });
          if (conversationMemory[memoryKey].length > memoryLimit * 2) {
             conversationMemory[memoryKey] = conversationMemory[memoryKey].slice(-(memoryLimit * 2));
          }
          lastSentResponses[memoryKey] = reply;

          return { reply, provider, latencyMs, keyLabel: key.label };
        }
      } catch (err: any) {
        const msg = `[${provider}:${key.label}] ${err.message}`;
        console.warn(`[Maya AI Failover] ${msg}`);
        errors.push(msg);
        // Continue to next key in pool
      }
    }
  }

  // 4. Failure Handling
  const combinedError = errors.length > 0 ? errors.join('; ') : 'No available AI keys configured or all providers unreachable.';
  const hasQuotaExhausted = errors.some(e => e.includes('429') || e.includes('quota'));
  
  let userAlert = options.language === 'en' 
    ? "AI connection issue. Please check your API keys in the dashboard! 🌸"
    : "আমার এআই ব্রেইনের সাথে সংযোগে সমস্যা হচ্ছে। দয়া করে ড্যাশবোর্ডে গিয়ে সঠিক Gemini, Groq বা OpenRouter API Key সেভ করুন! 🌸";

  if (hasQuotaExhausted) {
     userAlert = options.language === 'en'
       ? "AI pools exhausted. Please add more free API keys in the dashboard! 🌸"
       : "সমস্ত এআই কোটা শেষ হয়ে গেছে। দয়া করে ড্যাশবোর্ডে গিয়ে আরও কিছু ফ্রি এপিআই কি যুক্ত করুন! 🌸";
  }

  return {
    reply: userAlert,
    provider: 'none',
    latencyMs: Date.now() - startTime,
    error: combinedError
  };
}

export function clearConversationMemory(memoryKey?: string) {
  if (memoryKey) {
    delete conversationMemory[memoryKey];
    delete lastSentResponses[memoryKey];
  } else {
    Object.keys(conversationMemory).forEach(k => delete conversationMemory[k]);
  }
}

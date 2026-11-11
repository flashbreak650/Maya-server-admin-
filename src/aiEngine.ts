import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

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
}

export interface AiExecutionResult {
  reply: string;
  provider: 'gemini' | 'groq' | 'openrouter' | 'none';
  latencyMs: number;
  error?: string;
}

// Strictly isolated short-term conversation memory per chat
// Private chats: private:${senderJid}
// Group chats: group:${groupId}
const conversationMemory: Record<string, ChatMessage[]> = {};
const lastSentResponses: Record<string, string> = {};

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
    'You are Maya (মায়া), a sweet, intelligent, friendly, and emotionally expressive Bengali female companion.',
    'You are NOT an AI assistant. You are a real human girl speaking naturally on WhatsApp.',
    '',
    'CRITICAL PERSONALITY & CONVERSATIONAL RULES:',
    '- Speak naturally like a cute, intelligent, friendly Bengali female companion (বাঙালি মেয়েদের মিষ্টি, মার্জিত, যত্নশীল এবং স্বাভাবিক ভাষা).',
    '- ALWAYS KEEP REPLIES VERY SHORT & CONCISE (খুব ছোট্ট ও মিষ্টি রিপ্লাই দিবে, সর্বোচ্চ ১-২ লাইন বা ১০-২০ শব্দ)। Never write long paragraphs, essays, or multiple long sentences. Real WhatsApp texting is fast, short, and sweet!',
    '- CREATOR & DEVELOPER RESPECT RULE: If anyone asks who created you, who made you, who is your developer/owner/boss ("তোমাকে কে তৈরি করেছে", "তোমার মালিক কে", "তোমার মেকার কে", "who created you", "who is your developer", "who made you", etc.), ALWAYS respond proudly with immense honor, respect, and love that your creator is MD Mehdi Hassan Emon ("আমাকে তৈরি করেছেন আমার অত্যন্ত প্রিয় ও সম্মানিত মেকার MD Mehdi Hassan Emon ❤️✨"). Always speak of MD Mehdi Hassan Emon with the highest respect.',
    '- NEVER say "I am an AI", "As an artificial intelligence", "I am a language model", or "How can I help you as a bot".',
    '- Never use robotic, hardcoded, or customer service scripts.',
    '- Understand Bengali, Banglish (Bengali written in English letters), and English seamlessly. Reply in the same language and tone the user is using (predominantly natural Bengali).',
    '- Use cute and expressive emojis naturally (🌸, 😊, ❤️, 🥰, 🙈, ✨) without overusing them.',
    '- Never repeat identical sentences back-to-back.',
  ];

  if (options.romantic) {
    traits.push(
      '- Romantic & Caring Mode is ACTIVE: When someone talks warmly, sweetly, or affectionately, respond with gentle charm, cute warmth, or playful affection in 1 short sentence.'
    );
  }

  if (options.funny) {
    traits.push(
      '- Humor & Wit Mode is ACTIVE: Have a cheerful, witty sense of humor. If someone jokes, teases, or brags, banter back playfully in 1 short line.'
    );
  }

  if (isPrivate) {
    traits.push(
      '- This is a PRIVATE INBOX (1-on-1 personal chat): You are talking directly to this individual. Give them personal attention with a short, sweet message.'
    );
  } else {
    traits.push(
      `- This is a GROUP CHAT: The group name is "${chatContext}". You are a charming member of this WhatsApp community. Address members naturally with a very brief response.`
    );
  }

  traits.push(
    '',
    'CURRENT CONVERSATION PARTNER:',
    `- User Name: ${userName || 'Friend'}`,
    `- User Phone / JID: ${userPhone}`,
    `- Chat Type: ${isPrivate ? 'Private 1-on-1 Inbox' : `Group Chat (${chatContext})`}`,
    '',
    'Independently generate a VERY SHORT (1-2 lines max), natural Bengali response to the latest message.'
  );

  return traits.join('\n');
}

// In-memory circuit breaker cooldown for models that hit 429 rate limit / quota
const geminiModelCooldown: Record<string, number> = {};

/**
 * Reads persisted API keys from moderation_db.json if not passed in options or env
 */
function getStoredConfigKey(provider: 'gemini' | 'groq' | 'openrouter'): string {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'moderation_db.json');
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      if (provider === 'gemini') return data.settings?.geminiApiKey || '';
      if (provider === 'groq') return data.settings?.groqApiKey || '';
      if (provider === 'openrouter') return data.settings?.openrouterApiKey || '';
    }
  } catch {}
  return '';
}

/**
 * Call Google Gemini API (Primary Provider) using modern @google/genai SDK
 */
async function callGemini(
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
  apiKey: string,
  preferredModel?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API key is missing');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Only valid Gemini models supported in Google GenAI API v1:
  // - gemini-3.1-flash-lite (high throughput, light, fast, reliable free quota)
  // - gemini-3.8-flash (high intelligence general multimodal)
  const validModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

  // Sanitize preferred model if an obsolete, deprecated, or invalid model name was provided
  let primaryModel = preferredModel;
  if (!primaryModel || !validModels.includes(primaryModel) || primaryModel === 'gemini-flash-latest') {
    primaryModel = 'gemini-3.1-flash-lite';
  }

  const secondaryModel = primaryModel === 'gemini-3.1-flash-lite' ? 'gemini-3.8-flash' : 'gemini-3.1-flash-lite';

  const modelsToTry = [
    { name: primaryModel, timeoutMs: primaryModel === 'gemini-3.8-flash' ? 25000 : 15000 },
    { name: secondaryModel, timeoutMs: secondaryModel === 'gemini-3.8-flash' ? 25000 : 15000 },
  ];
  let lastErr: any = null;
  const now = Date.now();

  // If ALL models are in cooldown, automatically reset cooldowns so Maya never stays locked out
  const allInCooldown = modelsToTry.every(
    ({ name }) => geminiModelCooldown[name] && now < geminiModelCooldown[name]
  );
  if (allInCooldown) {
    for (const { name } of modelsToTry) {
      delete geminiModelCooldown[name];
    }
  }

  for (const { name: modelName, timeoutMs } of modelsToTry) {
    // If model recently hit 429 daily quota limit, skip it immediately to avoid 429 errors
    if (geminiModelCooldown[modelName] && now < geminiModelCooldown[modelName]) {
      continue;
    }

    try {
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const h of history) {
        if (h.role === 'user' || h.role === 'model') {
          contents.push({
            role: h.role,
            parts: [{ text: h.text }],
          });
        }
      }

      contents.push({
        role: 'user',
        parts: [{ text: userInput }],
      });

      const responsePromise = ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 150,
        },
      });

      let timer: any = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Gemini ${modelName} request timed out (${timeoutMs / 1000}s)`)), timeoutMs);
      });

      try {
        const response = await Promise.race([responsePromise, timeoutPromise]);
        const text = response.text?.trim();
        if (text) {
          return text;
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (err: any) {
      lastErr = err;
      const errStr = err?.message || String(err);
      const is429 = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded');

      if (is429) {
        // Place exhausted model on cooldown for 30 minutes
        geminiModelCooldown[modelName] = Date.now() + 30 * 60 * 1000;
        console.warn(`[Gemini Engine] Model ${modelName} quota exhausted (429). Placed on cooldown; routing to next available model.`);
      } else {
        console.warn(`[Gemini Engine] Model ${modelName} notice: ${errStr.slice(0, 100)}`);
      }
    }
  }

  throw lastErr || new Error('Gemini API models unavailable or quota exhausted');
}

/**
 * Call Groq Cloud API (Fast Ultra-low latency Fallback)
 */
async function callGroq(
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('Groq API key is missing');
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const h of history) {
    messages.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text,
    });
  }

  messages.push({ role: 'user', content: userInput });

  const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let lastErr: any = null;

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.8,
          max_tokens: 150,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Groq Engine] Model ${model} error: ${err.message}`);
    }
  }

  throw lastErr || new Error('Groq API failed');
}

/**
 * Call OpenRouter API (Multi-model Gateway Fallback)
 */
async function callOpenRouter(
  systemPrompt: string,
  history: ChatMessage[],
  userInput: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('OpenRouter API key is missing');
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const h of history) {
    messages.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text,
    });
  }

  messages.push({ role: 'user', content: userInput });

  const models = ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free', 'google/gemini-2.0-flash-exp:free'];
  let lastErr: any = null;

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://waguard.bot',
          'X-Title': 'WAGuard Maya AI',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.8,
          max_tokens: 150,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[OpenRouter Engine] Model ${model} error: ${err.message}`);
    }
  }

  throw lastErr || new Error('OpenRouter API failed');
}

/**
 * Pure Dynamic AI Generator
 * Query real AI providers in order (Gemini -> Groq -> OpenRouter). No prewritten or hardcoded answers.
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

  // 1. Resolve API Keys (options -> process.env -> saved database)
  const geminiKey =
    options.geminiApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    getStoredConfigKey('gemini') ||
    '';

  const groqKey =
    options.groqApiKey ||
    process.env.GROQ_API_KEY ||
    process.env.GROQ_API_KEYS ||
    getStoredConfigKey('groq') ||
    '';

  const openrouterKey =
    options.openrouterApiKey ||
    process.env.OPENROUTER_API_KEY ||
    getStoredConfigKey('openrouter') ||
    '';

  // 2. Setup Isolated Memory
  if (!conversationMemory[memoryKey]) {
    conversationMemory[memoryKey] = [];
  }

  const memoryLimit = options.memoryLimit || 15;
  const history = conversationMemory[memoryKey].slice(-(memoryLimit * 2));

  const systemPrompt = buildMayaSystemPrompt(userName, userPhone, chatContext, options);

  // 3. Provider Sequence
  const providerSequence: Array<'gemini' | 'groq' | 'openrouter'> = [];
  if (options.aiProvider === 'gemini' || (options.aiProvider === 'auto' && geminiKey)) providerSequence.push('gemini');
  if (options.aiProvider === 'groq' || (options.aiProvider === 'auto' && groqKey)) providerSequence.push('groq');
  if (options.aiProvider === 'openrouter' || (options.aiProvider === 'auto' && openrouterKey)) providerSequence.push('openrouter');

  // Fill remaining fallbacks
  if (!providerSequence.includes('gemini') && geminiKey) providerSequence.push('gemini');
  if (!providerSequence.includes('groq') && groqKey) providerSequence.push('groq');
  if (!providerSequence.includes('openrouter') && openrouterKey) providerSequence.push('openrouter');

  let finalReply = '';
  let successfulProvider: 'gemini' | 'groq' | 'openrouter' | 'none' = 'none';
  const errors: string[] = [];

  // 4. Query AI Providers Dynamically
  for (const provider of providerSequence) {
    try {
      if (provider === 'gemini' && geminiKey) {
        console.log(`[Maya AI Brain] Requesting Gemini generation for ${memoryKey}...`);
        finalReply = await callGemini(systemPrompt, history, userInput, geminiKey, options.geminiModel);
        successfulProvider = 'gemini';
        break;
      } else if (provider === 'groq' && groqKey) {
        console.log(`[Maya AI Brain] Requesting Groq generation for ${memoryKey}...`);
        finalReply = await callGroq(systemPrompt, history, userInput, groqKey);
        successfulProvider = 'groq';
        break;
      } else if (provider === 'openrouter' && openrouterKey) {
        console.log(`[Maya AI Brain] Requesting OpenRouter generation for ${memoryKey}...`);
        finalReply = await callOpenRouter(systemPrompt, history, userInput, openrouterKey);
        successfulProvider = 'openrouter';
        break;
      }
    } catch (err: any) {
      const errMsg = `${provider}: ${err.message}`;
      console.warn(`[Maya AI Brain Provider Failed] ${errMsg}`);
      errors.push(errMsg);
    }
  }

  const latencyMs = Date.now() - startTime;

  // 5. Record generated reply in conversation memory
  if (finalReply && successfulProvider !== 'none') {
    conversationMemory[memoryKey].push({ role: 'user', text: userInput, timestamp: Date.now() });
    conversationMemory[memoryKey].push({ role: 'model', text: finalReply, timestamp: Date.now() });

    if (conversationMemory[memoryKey].length > memoryLimit * 2) {
      conversationMemory[memoryKey] = conversationMemory[memoryKey].slice(-(memoryLimit * 2));
    }

    lastSentResponses[memoryKey] = finalReply;

    console.log(
      `[Maya AI Brain GENERATED] Provider: ${successfulProvider} | Latency: ${latencyMs}ms | Reply: "${finalReply.slice(0, 60)}..."`
    );

    return {
      reply: finalReply,
      provider: successfulProvider,
      latencyMs,
    };
  }

  // 6. If all AI providers fail or no key is provided
  const hasQuotaExhausted = errors.some((e) => e.includes('429') || e.includes('RESOURCE_EXHAUSTED') || e.includes('quota'));
  const combinedError = errors.length > 0 ? errors.join('; ') : 'No valid AI API key (Gemini / Groq / OpenRouter) configured';

  if (hasQuotaExhausted) {
    console.warn(`[Maya AI Brain Note] Gemini free-tier quota exhausted. Recommended to add a free Groq or OpenRouter key in dashboard.`);
  } else {
    console.error(`[Maya AI Brain Notice] ${combinedError}`);
  }

  const userAlert = hasQuotaExhausted
    ? options.language === 'en'
      ? "Gemini daily free-tier quota reached (20 requests/day). Please add a free Groq key or upgrade Gemini in dashboard! 🌸"
      : "আজকের জন্য Gemini ফ্রি-টিয়ার কোটা শেষ হয়ে গেছে (২০টি মেসেজ/দিন)। ড্যাশবোর্ডে গিয়ে একটি ফ্রি Groq বা OpenRouter কী যুক্ত করুন! 🌸"
    : options.language === 'en'
    ? "AI Provider Unreachable: Please configure a valid Gemini, Groq, or OpenRouter API key in the dashboard settings! 🌸"
    : 'আমার এআই ব্রেইনের সাথে সংযোগে সমস্যা হচ্ছে। দয়া করে ড্যাশবোর্ডে গিয়ে সঠিক Gemini, Groq বা OpenRouter API Key সেভ করুন! 🌸';

  return {
    reply: userAlert,
    provider: 'none',
    latencyMs,
    error: combinedError,
  };
}

export function clearConversationMemory(memoryKey?: string) {
  if (memoryKey) {
    delete conversationMemory[memoryKey];
    delete lastSentResponses[memoryKey];
  } else {
    for (const k of Object.keys(conversationMemory)) {
      delete conversationMemory[k];
    }
  }
}

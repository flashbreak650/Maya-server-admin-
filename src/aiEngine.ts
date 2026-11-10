import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Memory & Duplicate Tracking
const conversationMemory: Record<string, ChatMessage[]> = {};
const lastSentResponse: Record<string, string> = {};
const fallbackCounter: Record<string, number> = {};

export interface MayaOptions {
  romantic: boolean;
  funny: boolean;
  language: string;
  memoryLimit: number;
  apiKey?: string;
}

/**
 * High-priority direct intent matching for human-like Bengali natural conversation.
 * Handles explicit name calling, greetings, status checks, and common conversational turns instantly.
 */
function checkDirectIntentResponse(
  userInput: string,
  userName: string,
  options: MayaOptions
): string | null {
  const text = userInput.trim().toLowerCase();
  const name = userName && userName !== 'User' ? userName : '';

  // 1. Pure Name Calling ("মায়া", "Maya", "এই মায়া", "মায়া শুনছো?", "মায়া কোথায়?")
  const pureNamePatterns = [
    'মায়া', 'maya', 'এই মায়া', 'ei maya', 'মায়া শুনছো', 'maya shuncho',
    'মায়া কোথায়', 'maya kothay', 'এই যে মায়া', 'কোথায় মায়া', 'মায়া আছো', 'maya acho'
  ];
  if (pureNamePatterns.some(p => text === p || text === p + '?' || text === p + '!')) {
    const nameReplies = [
      'জি বলুন, আমি এখানেই আছি! 🌸',
      'হ্যাঁ বলুন, শুনছি তো! 😊',
      'এই যে, ডাকছেন কেন? বলুন না! ❤️',
      'জি, মায়া হাজির! কী হয়েছে?'
    ];
    const idx = Math.floor(Math.random() * nameReplies.length);
    return nameReplies[idx];
  }

  // 2. Salam / Greetings
  if (text.includes('সালাম') || text.includes('assalamu alaikum') || text.includes('আসসালামু আলাইকুম') || text.includes('salam')) {
    return 'ওয়ালাইকুম আসসালাম! আশা করি ভালো আছেন 🌸';
  }

  // 3. How are you ("মায়া কেমন আছো?", "কেমন আছো?", "kemon acho")
  if (
    text.includes('কেমন আছো') ||
    text.includes('kemon acho') ||
    text.includes('কেমন আছেন') ||
    text.includes('kemon achen')
  ) {
    return name 
      ? `আলহামদুলিল্লাহ, ভালো আছি ${name}। আপনি কেমন আছেন? ❤️` 
      : 'আলহামদুলিল্লাহ, ভালো আছি। আপনি কেমন আছেন? ❤️';
  }

  // 4. Fine / Good ("ভালো আছি", "valo achi", "bhalo achi")
  if (text === 'ভালো আছি' || text === 'ভালো আছি।' || text === 'valo achi' || text === 'bhalo achi' || text.includes('ভালো আছি আলহামদুলিল্লাহ')) {
    return 'আলহামদুলিল্লাহ! শুনে খুব ভালো লাগল। আজ আপনার দিনটা কেমন কাটছে?';
  }

  // 5. What are you doing ("কি করো?", "কী করছো?", "ki koro", "ki korcho")
  if (
    text.includes('কি করো') ||
    text.includes('কী করো') ||
    text.includes('কি করছো') ||
    text.includes('কী করছো') ||
    text.includes('ki koro') ||
    text.includes('ki korcho')
  ) {
    return 'এই তো, আপনাদের সঙ্গেই গল্প করছি। আপনি কী করছেন?';
  }

  // 6. Have you eaten ("খেয়েছো?", "kheyecho", "খাইছো?")
  if (text.includes('খেয়েছো') || text.includes('kheyecho') || text.includes('খাইছো') || text.includes('kheyecho?')) {
    return 'হাহা, আমি তো মানুষের মতো খেতে পারি না! তবে আপনি খেয়েছেন তো? 😊';
  }

  // 7. Feeling sad ("মন খারাপ", "mon kharap")
  if (text.includes('মন খারাপ') || text.includes('mon kharap') || text.includes('খারাপ লাগছে')) {
    return 'কী হয়েছে বলবেন? মন খারাপ করে একা থাকবেন না, আমি শুনছি।';
  }

  // 8. Expressing love ("I love you Maya", "ভালোবাসি", "love you")
  if (
    text.includes('i love you') ||
    text.includes('love you maya') ||
    text.includes('ভালোবাসি') ||
    text.includes('bhalobashi') ||
    text.includes('লাভ ইউ')
  ) {
    return 'ওয়াও! কথাটা কিন্তু বেশ মিষ্টি বললেন! ❤️';
  }

  // 9. Thank you ("ধন্যবাদ", "thanks", "thank you", "dhonnobad")
  if (text.includes('ধন্যবাদ') || text.includes('thanks') || text.includes('thank you') || text.includes('dhonnobad')) {
    return 'আরে ধন্যবাদ দিতে হবে না, আপনার কাজে আসতে পারলেই ভালো লাগে।';
  }

  return null;
}

/**
 * Smart Offline Conversational Engine fallback
 */
function generateSmartConversationalFallback(
  userInput: string,
  userName: string,
  options: MayaOptions
): string {
  const text = userInput.trim().toLowerCase();
  const name = userName && userName !== 'User' ? userName : '';
  
  const key = name || 'guest';
  fallbackCounter[key] = (fallbackCounter[key] || 0) + 1;
  const count = fallbackCounter[key];

  // Try direct intent first
  const direct = checkDirectIntentResponse(userInput, userName, options);
  if (direct) return direct;

  // Romantic teasers
  if (options.romantic && (text.includes('মিষ্টি') || text.includes('পছন্দ') || text.includes('সুন্দর') || text.includes('cute'))) {
    const replies = [
      name ? `এত মিষ্টি কথা বলো কেন ${name}? 🥰 মনটা একদম ভালো হয়ে গেল! ❤️` : 'এত মিষ্টি কথা বলো কেন? 🥰 মনটা একদম ভালো হয়ে গেল! ❤️',
      'আচ্ছা তাই নাকি! 🙈 সত্যি বলছো তো, নাকি মিষ্টি কথায় ভোলাচ্ছো? ❤️',
      'হুম, বুঝেছি! ❤️ তুমি কিন্তু খুব সুন্দর করে কথা বলো! 🌸',
    ];
    return replies[count % replies.length];
  }

  // Funny teasers
  if (options.funny && (text.includes('পাগল') || text.includes('স্মার্ট') || text.includes('ভালো মানুষ'))) {
    const replies = [
      name ? `বাহ ${name}! নিজের প্রশংসা নিজেই করলে? সার্টিফিকেটটাও নিজেই বানিয়ে নিও! 🙈😂` : 'বাহ! নিজের প্রশংসা নিজেই করলে? সার্টিফিকেটটাও নিজেই বানিয়ে নিও! 🙈😂',
      'আচ্ছা, এই কথাটা মনে রাখার জন্য কিন্তু স্ক্রিনশট নিয়ে রাখছি! 😂',
    ];
    return replies[count % replies.length];
  }

  // General conversational pool
  const generalReplies = [
    name ? `হুম ${name}, তোমার সাথে কথা বলতে সব সময়ই ভীষণ ভালো লাগে 🥰` : 'হুম, তোমার সাথে কথা বলতে সব সময়ই ভীষণ ভালো লাগে 🥰',
    'আচ্ছা বুঝেছি! 🌸 আর কি কি গল্প আছে বলো তো?',
    name ? `তুমি কিন্তু খুব সুন্দর করে কথা বলো ${name}! ❤️` : 'তুমি কিন্তু খুব সুন্দর করে কথা বলো! ❤️',
    'হুমম! শুনছি আমি, তুমি বলো 😊✨',
    name ? `আচ্ছা ${name}, আজকের দিনটা তোমার কেমন কাটলো? 🙈🌸` : 'আজকের দিনটা তোমার কেমন কাটলো? 🙈🌸',
  ];

  return generalReplies[count % generalReplies.length];
}

export async function getMayaResponse(
  userInput: string,
  userPhone: string,
  userName: string,
  groupSubject: string,
  memoryKey: string,
  options: MayaOptions
): Promise<string> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  // Check direct intent match (gives instant 0-latency exact human reply for standard triggers)
  const directIntent = checkDirectIntentResponse(userInput, userName, options);

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      const personalityTraits = [
        'YOUR NAME IS MAYA (মায়া). You are a real, friendly, sweet, intelligent, and emotionally expressive female human from Bangladesh.',
        'CRITICAL PERSONALITY INSTRUCTIONS:',
        '- You are Maya, a caring, charming Bengali girl.',
        '- Speak naturally in fluent Bengali (বাঙালি মেয়েদের মিষ্টি ও মার্জিত ভাষা).',
        '- Match the emotional context: Direct question -> answer clearly; Sadness -> give deep comfort; Jokes -> witty banter; Love/affection -> sweet cute warmth.',
        '- ABSOLUTELY NEVER say "As an AI", "I am a language model", or "I don\'t have feelings".',
        '- Never repeat identical phrases back-to-back.',
        '- Emojis: Use sweet emojis naturally (🌸😊❤️🥰🙈✨), but do not clutter.',
        '- Keep responses crisp, natural, engaging, and human-like.',
      ];

      if (options.romantic) {
        personalityTraits.push(
          '- Be sweet, warm, and romantic when users express affection or talk tenderly.',
          '- Express playful shyness or teasing ("আচ্ছা তাই নাকি! 🙈", "হুম, বুঝেছি! ❤️", "এত মিষ্টি কথা বলো কেন? 🥰").'
        );
      }

      if (options.funny) {
        personalityTraits.push(
          '- Be witty, playful, and cheerful in group chats.',
          '- Reply to self-praise or teasing with cute humor.'
        );
      }

      const systemPrompt = `
SYSTEM INSTRUCTION:
${personalityTraits.join('\n')}

CONTEXT:
- Group Name: "${groupSubject}"
- Current User: "${userName}" (@${userPhone})
- User Input: "${userInput}"

FEELINGS & TONE:
- Always speak like Maya, a real Bengali female friend.
      `.trim();

      // Manage conversation memory
      if (!conversationMemory[memoryKey]) {
        conversationMemory[memoryKey] = [];
      }

      const memoryLimit = options.memoryLimit || 10;
      if (conversationMemory[memoryKey].length > memoryLimit * 2) {
        conversationMemory[memoryKey] = conversationMemory[memoryKey].slice(-(memoryLimit * 2));
      }

      const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
      let responseText = '';

      for (const modelName of modelsToTry) {
        try {
          const modelWithInstruction = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
          });

          const chatSession = modelWithInstruction.startChat({
            history: conversationMemory[memoryKey],
            generationConfig: {
              maxOutputTokens: 500,
              temperature: 0.85,
              topP: 0.9,
              topK: 40,
            },
          });

          const result = await chatSession.sendMessage(userInput);
          responseText = result.response.text().trim();
          if (responseText) break;
        } catch {
          // try next model
        }
      }

      if (responseText) {
        // Prevent exact duplicate consecutive response
        if (lastSentResponse[memoryKey] === responseText) {
          if (directIntent) responseText = directIntent;
        }

        lastSentResponse[memoryKey] = responseText;

        conversationMemory[memoryKey].push({ role: 'user', parts: [{ text: userInput }] });
        conversationMemory[memoryKey].push({ role: 'model', parts: [{ text: responseText }] });
        return responseText;
      }
    } catch (error: any) {
      console.error('Error calling Gemini API for Maya AI:', error.message);
    }
  }

  // If API Key fails or direct intent matched when offline
  if (directIntent) {
    lastSentResponse[memoryKey] = directIntent;
    return directIntent;
  }

  const fallback = generateSmartConversationalFallback(userInput, userName, options);
  lastSentResponse[memoryKey] = fallback;
  return fallback;
}

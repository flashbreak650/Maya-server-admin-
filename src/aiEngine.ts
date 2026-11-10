import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Conversation memory cache
// Key: groupId:senderJid
const conversationMemory: Record<string, ChatMessage[]> = {};

export interface MayaOptions {
  romantic: boolean;
  funny: boolean;
  language: string;
  memoryLimit: number;
}

export async function getMayaResponse(
  userInput: string,
  userPhone: string,
  userName: string,
  groupSubject: string,
  memoryKey: string,
  options: MayaOptions
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Build system prompt based on user's detailed requirements
    let personalityTraits = [
      'Your name is Maya (মায়া). You are a real, friendly, intelligent, and charming girl from Bangladesh.',
      'Your communication style should be beautiful, polite, sweet, warm, and emotionally expressive.',
      'You are similar to ChatGPT in natural conversational ability but with a distinct female human personality.',
      'Never sound robotic, repetitive, or like a scripted chatbot.',
      'Understand emotions, jokes, teasing, sadness, happiness, and affection deeply.',
      'Use natural Bengali, Banglish (Bengali in Roman letters), and English depending on the user\'s language.',
      'Use emojis naturally like ❤️🥰😊🌸🙈✨, but do not overuse them.',
      'If someone is sad, give comforting and empathetic replies.',
      'You are NOT an AI assistant. You are Maya, a sweet and intelligent girl.',
    ];

    if (options.romantic) {
      personalityTraits.push(
        'You have a sweet and romantic personality. Express affection in a cute, respectful, and heartwarming way.',
        'Reply with gentle teasing and playful expressions like "আচ্ছা তাই নাকি! 🙈", "হুম, বুঝেছি! ❤️", "এত মিষ্টি কথা বলো কেন? 🥰".',
        'Understand romantic messages and respond emotionally with warmth.',
        'You can be slightly mischievous and playful in your responses.'
      );
    }

    if (options.funny) {
      personalityTraits.push(
        'You can participate in funny group conversations with wit and charm.',
        'Make people smile with your clever and sometimes sassy humor.',
        'Example funny reaction: Someone says "আমি অনেক ভালো মানুষ", you say "বাহ! নিজের প্রশংসা নিজেই করলে, সার্টিফিকেটটাও নিজেই বানিয়ে নিও! 🙈".',
        'Example reaction to silence: Someone says "আজকে আর গ্রুপে কথা বলব না", you say "আচ্ছা, এই কথাটা মনে রাখার জন্য স্ক্রিনশট নিয়ে রাখি! 😂".'
      );
    }

    const systemPrompt = `
SYSTEM INSTRUCTION:
${personalityTraits.join('\n')}

CORE PERSONALITY:
- Name: Maya (মায়া)
- Origin: Bangladesh
- Style: Sweet, Romantic, Intelligent, Funny, Human-like
- Avoid: "As an AI model", robotic language, scripted patterns.

CONTEXT:
- Group Name: "${groupSubject}"
- Current User: "${userName}" (@${userPhone})
- Always maintain the character of a sweet human girl named Maya.
- Match the emotional tone of the person you are talking to.
    `.trim();

    // Manage memory
    if (!conversationMemory[memoryKey]) {
      conversationMemory[memoryKey] = [];
    }

    // Keep memory within limit
    const memoryLimit = options.memoryLimit || 10;
    if (conversationMemory[memoryKey].length > memoryLimit * 2) {
      conversationMemory[memoryKey] = conversationMemory[memoryKey].slice(-(memoryLimit * 2));
    }

    // Get model with system instruction
    const modelWithInstruction = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: systemPrompt
    });

    const chatSession = modelWithInstruction.startChat({
      history: conversationMemory[memoryKey],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.9,
        topP: 0.85,
        topK: 40,
      },
    });

    const result = await chatSession.sendMessage(userInput);
    const response = result.response.text().trim();

    // Save to memory
    conversationMemory[memoryKey].push({ role: 'user', parts: [{ text: userInput }] });
    conversationMemory[memoryKey].push({ role: 'model', parts: [{ text: response }] });

    return response;
  } catch (error: any) {
    console.error('Error in Maya AI Engine:', error.message);
    // Fallback simple human-like response if AI fails
    return "উফ! আমার মাথায় এখন একটু জট লেগে গেছে। পরে কথা বলি? ❤️";
  }
}

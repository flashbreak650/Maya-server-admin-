import React from 'react';

export interface HelpDetails {
  id: string;
  titleBn: string;
  titleEn: string;
  categoryBn: string;
  categoryEn: string;
  iconName: string;
  onBn: string;
  onEn: string;
  offBn: string;
  offEn: string;
}

export const HELP_ITEMS: Record<string, HelpDetails> = {
  adminShield: {
    id: 'adminShield',
    titleBn: 'Admin Security Shield',
    titleEn: 'Admin Security Shield',
    categoryBn: 'A. Security',
    categoryEn: 'A. Security',
    iconName: 'ShieldAlert',
    onBn: 'অ্যাডমিনরা সব নিয়ম থেকে মুক্ত থাকবে। তাদের মেসেজ ডিলিট বা কিক হবে না।',
    onEn: 'Admins are exempt from all rules. No deletions or kicks applied to them.',
    offBn: 'অ্যাডমিনরাও সাধারণ সদস্যদের মতো নিয়মের আওতায় থাকবে।',
    offEn: 'Admins will be treated as regular members and moderated.',
  },

  autoKick3Warnings: {
    id: 'autoKick3Warnings',
    titleBn: 'Three Warning Auto Kick',
    titleEn: 'Three Warning Auto Kick',
    categoryBn: 'A. Security',
    categoryEn: 'A. Security',
    iconName: 'UserX',
    onBn: '৩ বার নিয়ম ভাঙলে সদস্যকে স্বয়ংক্রিয়ভাবে গ্রুপ থেকে কিক করা হবে।',
    onEn: 'Automatically kicks a member from the group after 3 violations.',
    offBn: 'সদস্যকে কিক করা হবে না, শুধুমাত্র ওয়ার্নিং দেওয়া হবে।',
    offEn: 'Members will not be kicked; only warnings will be issued.',
  },

  warningManagement: {
    id: 'warningManagement',
    titleBn: 'Warning Reset',
    titleEn: 'Warning Reset',
    categoryBn: 'A. Security',
    categoryEn: 'A. Security',
    iconName: 'RotateCcw',
    onBn: 'সবার ওয়ার্নিং রিসেট করে ০ করে দিলে সদস্যরা আবার নতুন করে সুযোগ পাবে।',
    onEn: 'Resetting all warnings to 0 grants members a fresh start.',
    offBn: 'আগের ওয়ার্নিংগুলো বহাল থাকবে।',
    offEn: 'Existing warning counts will remain unchanged.',
  },

  antiStickerSpam: {
    id: 'antiStickerSpam',
    titleBn: 'Anti-Sticker Spam',
    titleEn: 'Anti-Sticker Spam',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'Lock',
    onBn: 'অতিরিক্ত স্টিকার দিলে পুরো গ্রুপ ১০ মিনিটের জন্য লক হয়ে যাবে।',
    onEn: 'Locks the entire group for 10 minutes if rapid sticker spam is detected.',
    offBn: 'স্টিকার স্প্যাম করলেও গ্রুপ লক হবে না।',
    offEn: 'Group will not be locked during sticker spam events.',
  },

  antiSticker: {
    id: 'antiSticker',
    titleBn: 'Anti-Sticker Filter',
    titleEn: 'Anti-Sticker Filter',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'Smile',
    onBn: 'গ্রুপে কোনো স্টিকার পাঠানো যাবে না। পাঠালে সাথে সাথে ডিলিট হবে।',
    onEn: 'No stickers allowed. Any incoming sticker is deleted instantly.',
    offBn: 'সদস্যরা গ্রুপে স্টিকার পাঠাতে পারবে।',
    offEn: 'Members are allowed to send stickers freely.',
  },

  antiGif: {
    id: 'antiGif',
    titleBn: 'Anti-GIF Filter',
    titleEn: 'Anti-GIF Filter',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'Film',
    onBn: 'জিআইএফ (GIF) এবং এনিমেটেড ভিডিও ডিলিট করা হবে।',
    onEn: 'All animated GIFs and video-based GIFs will be removed.',
    offBn: 'জিআইএফ পাঠানোর অনুমতি থাকবে।',
    offEn: 'Members can send GIFs without restriction.',
  },

  antiVideo: {
    id: 'antiVideo',
    titleBn: 'Anti-Video Filter',
    titleEn: 'Anti-Video Filter',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'Film',
    onBn: 'সাধারণ সদস্যদের পাঠানো যেকোনো ভিডিও ডিলিট করা হবে।',
    onEn: 'Deletes any video files sent by regular group members.',
    offBn: 'গ্রুপে ভিডিও পাঠানোর অনুমতি থাকবে।',
    offEn: 'Video sharing is enabled for all members.',
  },

  antiImage: {
    id: 'antiImage',
    titleBn: 'Anti-Image Filter',
    titleEn: 'Anti-Image Filter',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'ImageIcon',
    onBn: 'গ্রুপে কোনো ফটো বা ছবি পাঠানো যাবে না।',
    onEn: 'Prohibits and deletes all incoming photos and pictures.',
    offBn: 'ছবি পাঠানোর অনুমতি থাকবে।',
    offEn: 'Members can share photos and images.',
  },

  antiViewOnce: {
    id: 'antiViewOnce',
    titleBn: 'Anti-View Once',
    titleEn: 'Anti-View Once',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'EyeOff',
    onBn: 'হোয়াটসঅ্যাপের "ভিউ ওয়ান্স" মিডিয়া পাঠানো মাত্র ডিলিট হবে।',
    onEn: 'Instantly removes "View Once" media to prevent disappearing content.',
    offBn: 'ভিউ ওয়ান্স মিডিয়া পাঠানোর অনুমতি থাকবে।',
    offEn: 'View Once media is allowed in the chat.',
  },

  antiLink: {
    id: 'antiLink',
    titleBn: 'Anti-Link Filter',
    titleEn: 'Anti-Link Filter',
    categoryBn: 'B. Anti-Spam',
    categoryEn: 'B. Anti-Spam',
    iconName: 'LinkIcon',
    onBn: 'যেকোনো ওয়েবসাইট বা গ্রুপের ইনভাইট লিংক ডিলিট করা হবে।',
    onEn: 'Blocks and deletes all URLs and group invite links.',
    offBn: 'লিংক শেয়ার করার অনুমতি থাকবে।',
    offEn: 'Links can be shared freely within the group.',
  },

  antiBadword: {
    id: 'antiBadword',
    titleBn: 'Anti-Badword',
    titleEn: 'Anti-Badword',
    categoryBn: 'C. Moderation',
    categoryEn: 'C. Moderation',
    iconName: 'Ban',
    onBn: 'গালি বা অপমানজনক শব্দ শনাক্ত হলে মেসেজ ডিলিট হবে।',
    onEn: 'Deletes messages containing profanity or offensive language.',
    offBn: 'গালি ফিল্টার নিষ্ক্রিয় থাকবে।',
    offEn: 'Profanity filter is disabled; all words allowed.',
  },

  salamProtection: {
    id: 'salamProtection',
    titleBn: 'Salam Protection',
    titleEn: 'Salam Protection',
    categoryBn: 'C. Moderation',
    categoryEn: 'C. Moderation',
    iconName: 'CheckCircle2',
    onBn: 'সালাম ও কুশলবিনিময় কখনোই গালি হিসেবে ডিলিট হবে না।',
    onEn: 'Ensures greetings like "Salam" are never falsely deleted.',
    offBn: 'সালাম সুরক্ষার কোনো আলাদা লেয়ার থাকবে না।',
    offEn: 'No specialized protection for greeting messages.',
  },

  customBadwords: {
    id: 'customBadwords',
    titleBn: 'Custom Badwords',
    titleEn: 'Custom Badwords',
    categoryBn: 'C. Moderation',
    categoryEn: 'C. Moderation',
    iconName: 'FileText',
    onBn: 'আপনার নিজের দেওয়া লিস্টের শব্দগুলোও বট ডিলিট করবে।',
    onEn: 'Bot will moderate based on your manually added word list.',
    offBn: 'শুধুমাত্র বটের নিজস্ব ডিকশনারি কাজ করবে।',
    offEn: 'Only the built-in dictionary will be used for moderation.',
  },

  botReply: {
    id: 'botReply',
    titleBn: 'Bot Reply',
    titleEn: 'Bot Reply',
    categoryBn: 'C. Moderation',
    categoryEn: 'C. Moderation',
    iconName: 'Bot',
    onBn: 'ট্যাগ বা মেনশন করলে বট উত্তর দিবে।',
    onEn: 'Bot will respond when tagged or mentioned in groups.',
    offBn: 'বট গ্রুপের কোনো কথায় উত্তর দিবে না।',
    offEn: 'Bot remains silent and does not respond to messages.',
  },

  mayaEngine: {
    id: 'mayaEngine',
    titleBn: 'Maya AI Engine',
    titleEn: 'Maya AI Engine',
    categoryBn: 'D. Maya AI',
    categoryEn: 'D. Maya AI',
    iconName: 'Heart',
    onBn: 'মায়ার স্মার্ট পারসোনালিটি এবং ব্রেইন সক্রিয় হবে।',
    onEn: 'Activates Maya\'s advanced AI personality and intelligence.',
    offBn: 'এআই নিষ্ক্রিয় থাকবে, সাধারণ রিপ্লাই কাজ করতে পারে।',
    offEn: 'AI brain disabled; standard responses only.',
  },

  mayaPrivateReply: {
    id: 'mayaPrivateReply',
    titleBn: 'Private Inbox AI',
    titleEn: 'Private Inbox AI',
    categoryBn: 'D. Maya AI',
    categoryEn: 'D. Maya AI',
    iconName: 'MessagesSquare',
    onBn: 'বটের ইনবক্সে কথা বললে মায়া মানুষের মতো উত্তর দিবে।',
    onEn: 'Maya chats naturally with users in the bot\'s private DMs.',
    offBn: 'ইনবক্সে কোনো রিপ্লাই দিবে না।',
    offEn: 'Bot will not respond to private inbox messages.',
  },

  mayaGroupReply: {
    id: 'mayaGroupReply',
    titleBn: 'Group AI Reply',
    titleEn: 'Group AI Reply',
    categoryBn: 'D. Maya AI',
    categoryEn: 'D. Maya AI',
    iconName: 'Users',
    onBn: 'গ্রুপে মায়াকে ডাকলে সে আড্ডায় অংশ নিবে।',
    onEn: 'Enables Maya to participate in group discussions when called.',
    offBn: 'গ্রুপ আড্ডায় মায়া অংশ নিবে না।',
    offEn: 'Maya will not participate in group chat conversations.',
  },

  mayaRomantic: {
    id: 'mayaRomantic',
    titleBn: 'Romantic Mode',
    titleEn: 'Romantic Mode',
    categoryBn: 'D. Maya AI',
    categoryEn: 'D. Maya AI',
    iconName: 'MessageSquareHeart',
    onBn: 'মায়া মিষ্টি, যত্নশীল ও রোমান্টিক ভাষায় কথা বলবে।',
    onEn: 'Maya adopts a sweet, caring, and romantic speaking style.',
    offBn: 'মায়া সাধারণ ফরমাল ভাষায় কথা বলবে।',
    offEn: 'Maya will use a standard or formal conversational tone.',
  },

  mayaFunny: {
    id: 'mayaFunny',
    titleBn: 'Funny Mode',
    titleEn: 'Funny Mode',
    categoryBn: 'D. Maya AI',
    categoryEn: 'D. Maya AI',
    iconName: 'Smile',
    onBn: 'মায়া হাসিখুশি, দুষ্টুমি ও ফানি রিপ্লাই দিবে।',
    onEn: 'Maya provides playful, witty, and humorous responses.',
    offBn: 'মায়া খুব বেশি দুষ্টুমি বা ফান করবে না।',
    offEn: 'Maya will avoid mischievous or overly funny remarks.',
  },

  mayaAutoParticipate: {
    id: 'mayaAutoParticipate',
    titleBn: 'Auto Participation',
    titleEn: 'Auto Participation',
    categoryBn: 'D. Maya AI',
    categoryEn: 'D. Maya AI',
    iconName: 'Zap',
    onBn: 'মায়া না ডাকলেও গ্রুপে নিজ থেকে কথা বলতে পারবে।',
    onEn: 'Maya can join conversations autonomously without being tagged.',
    offBn: 'শুধুমাত্র ট্যাগ করলেই মায়া কথা বলবে।',
    offEn: 'Maya only responds when explicitly mentioned or tagged.',
  },

  botConnection: {
    id: 'botConnection',
    titleBn: 'WhatsApp Connection',
    titleEn: 'WhatsApp Connection',
    categoryBn: 'E. Status',
    categoryEn: 'E. Status',
    iconName: 'Plug',
    onBn: 'হোয়াটসঅ্যাপ সার্ভারের সাথে লাইভ সংযোগ সচল থাকবে।',
    onEn: 'Maintains an active live connection with WhatsApp servers.',
    offBn: 'বট অফলাইনে থাকবে এবং কোনো কাজ করবে না।',
    offEn: 'Bot stays offline and will not perform any actions.',
  },

  activityLogs: {
    id: 'activityLogs',
    titleBn: 'Activity Logs',
    titleEn: 'Activity Logs',
    categoryBn: 'E. Status',
    categoryEn: 'E. Status',
    iconName: 'Activity',
    onBn: 'গ্রুপে ঘটা সকল ডিলিট ও ওয়ার্নিংয়ের লাইভ রিপোর্ট দেখাবে।',
    onEn: 'Displays real-time logs of all deletions and warnings.',
    offBn: 'অ্যাক্টিভিটি হিস্টোরি দেখা যাবে না।',
    offEn: 'Activity history tracking will be unavailable.',
  },

  serverConnection: {
    id: 'serverConnection',
    titleBn: 'Server Connection',
    titleEn: 'Server Connection',
    categoryBn: 'E. Status',
    categoryEn: 'E. Status',
    iconName: 'Server',
    onBn: 'ড্যাশবোর্ড ও মডারেশন ইঞ্জিনের সংযোগ সচল থাকবে।',
    onEn: 'Keeps the link between dashboard and bot engine active.',
    offBn: 'ড্যাশবোর্ড থেকে বট কন্ট্রোল করা যাবে না।',
    offEn: 'Dashboard cannot communicate with or control the bot.',
  }
};

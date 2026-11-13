import React from 'react';
import {
  ShieldAlert,
  UserX,
  RotateCcw,
  Lock,
  Smile,
  Film,
  Image as ImageIcon,
  EyeOff,
  Link as LinkIcon,
  VolumeX,
  Ban,
  CheckCircle2,
  FileText,
  Bot,
  Heart,
  MessagesSquare,
  Users,
  MessageSquareHeart,
  Plug,
  Activity,
  X,
  Power,
  PowerOff,
  Info
} from 'lucide-react';
import { HelpDetails } from '../helpData.ts';

interface HelpModalProps {
  helpItem: HelpDetails | null;
  isOpen: boolean;
  onClose: () => void;
  isBn: boolean;
  currentStatusText?: string;
  isStatusActive?: boolean;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  helpItem,
  isOpen,
  onClose,
  isBn,
  currentStatusText,
  isStatusActive = true,
}) => {
  if (!isOpen || !helpItem) return null;

  const renderIcon = (name: string, color: string) => {
    const props = { size: 18, className: color };
    switch (name) {
      case 'ShieldAlert': return <ShieldAlert {...props} />;
      case 'UserX': return <UserX {...props} />;
      case 'RotateCcw': return <RotateCcw {...props} />;
      case 'Lock': return <Lock {...props} />;
      case 'Smile': return <Smile {...props} />;
      case 'Film': return <Film {...props} />;
      case 'ImageIcon': return <ImageIcon {...props} />;
      case 'EyeOff': return <EyeOff {...props} />;
      case 'LinkIcon': return <LinkIcon {...props} />;
      case 'VolumeX': return <VolumeX {...props} />;
      case 'Ban': return <Ban {...props} />;
      case 'CheckCircle2': return <CheckCircle2 {...props} />;
      case 'FileText': return <FileText {...props} />;
      case 'Bot': return <Bot {...props} />;
      case 'Heart': return <Heart {...props} />;
      case 'MessagesSquare': return <MessagesSquare {...props} />;
      case 'Users': return <Users {...props} />;
      case 'MessageSquareHeart': return <MessageSquareHeart {...props} />;
      case 'Plug': return <Plug {...props} />;
      case 'Activity': return <Activity {...props} />;
      default: return <Info {...props} />;
    }
  };

  const title = isBn ? helpItem.titleBn : helpItem.titleEn;
  const onText = isBn ? helpItem.onBn : helpItem.onEn;
  const offText = isBn ? helpItem.offBn : helpItem.offEn;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-slate-900/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white max-w-[320px] w-full border-2 border-emerald-600 shadow-2xl flex flex-col overflow-hidden animate-appear rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="px-5 pt-5 pb-3 relative bg-emerald-50/30">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={18} strokeWidth={3} />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-white text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-xs shrink-0">
              {renderIcon(helpItem.iconName, 'text-emerald-600')}
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-[14px] text-[#1c3027] leading-tight truncate">
                {title}
              </h3>
              {currentStatusText && (
                <div className="flex items-center gap-1.5 mt-1">
                   <div className={`w-1.5 h-1.5 ${isStatusActive ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                   <span className={`text-[9px] font-black uppercase tracking-wider ${isStatusActive ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {currentStatusText}
                   </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Content (Cut System) */}
        <div className="p-4 space-y-2">
          
          {/* ON Card */}
          <div className="bg-[#f2faf7] border border-[#c6e9e2] p-3">
            <div className="flex items-center gap-2 mb-1">
               <Power size={13} strokeWidth={3} className="text-[#10b981]" />
               <span className="text-[9px] font-black text-[#10b981] uppercase tracking-widest">ON (চালু)</span>
            </div>
            <p className="text-[11.5px] font-bold text-[#2d4d42] leading-snug">
              {onText}
            </p>
          </div>

          {/* OFF Card */}
          <div className="bg-[#fffcfc] border border-[#fecaca] p-3">
            <div className="flex items-center gap-2 mb-1">
               <PowerOff size={13} strokeWidth={3} className="text-[#ef4444]" />
               <span className="text-[9px] font-black text-[#ef4444] uppercase tracking-widest">OFF (বন্ধ)</span>
            </div>
            <p className="text-[11.5px] font-semibold text-[#6b3a3a] leading-snug">
              {offText}
            </p>
          </div>

        </div>

        {/* Action Button */}
        <div className="bg-[#1c3027] p-2">
           <button
            onClick={onClose}
            className="w-full py-2 text-white text-[12px] font-black hover:bg-[#254236] transition-colors cursor-pointer"
          >
            {isBn ? 'বুঝেছি' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};

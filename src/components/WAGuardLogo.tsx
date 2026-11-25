import React, { useId } from 'react';

interface WAGuardLogoProps {
  variant?: 'mark' | 'bot' | 'device';
  className?: string;
}

/**
 * Unified WAGuard Brand & WhatsApp Security Logo
 * Replaces generic shield/emoji placeholders with a cohesive vector crest.
 */
export const WAGuardLogo: React.FC<WAGuardLogoProps> = ({
  variant = 'mark',
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');

  if (variant === 'bot') {
    const gradId = `wg-bot-grad-${uid}`;
    return (
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="18" y1="16" x2="104" y2="108" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DDF9EC" />
          </linearGradient>
        </defs>
        {/* Outer Shield Crest */}
        <path
          d="M60 12L98 26.5V56.5C98 81.5 81.5 101.2 60 109.5C38.5 101.2 22 81.5 22 56.5V26.5L60 12Z"
          fill={`url(#${gradId})`}
          fillOpacity="0.96"
        />
        {/* Inner Emerald Core Shield */}
        <path
          d="M60 22L88 32.8V56C88 75.6 75.8 91.2 60 98.4C44.2 91.2 32 75.6 32 56V32.8L60 22Z"
          fill="#087F55"
        />
        {/* WhatsApp Signal Ring + Guard Check */}
        <path
          d="M60 35.5C48.4 35.5 39 44.6 39 55.8C39 60.2 40.4 64.2 42.9 67.5L40.4 76.2L49.5 73.8C52.6 75.6 56.2 76.6 60 76.6C71.6 76.6 81 67.5 81 56.3C81 44.6 71.6 35.5 60 35.5Z"
          fill="#10B975"
          fillOpacity="0.28"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
        <path
          d="M50.5 56.2L57 62.5L70.5 49"
          stroke="#FFFFFF"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (variant === 'device') {
    const gradId = `wg-dev-grad-${uid}`;
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#14BD7A" />
            <stop offset="100%" stopColor="#07734C" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="16" fill={`url(#${gradId})`} />
        <path
          d="M32 14L48 20.2V32.4C48 42.6 41.2 50.6 32 54C22.8 50.6 16 42.6 16 32.4V20.2L32 14Z"
          fill="#FFFFFF"
          fillOpacity="0.16"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <rect
          x="25.5"
          y="22.5"
          width="13"
          height="20"
          rx="3"
          fill="#FFFFFF"
        />
        <rect x="28" y="25.5" width="8" height="11.5" rx="1.2" fill="#087F55" />
        <path
          d="M30 31.3L31.5 32.8L34.4 29.8"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="39.8" r="1" fill="#087F55" />
      </svg>
    );
  }

  // Default 'mark' variant — compact header & account badge logo
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 3.5L26.5 7.5V15.5C26.5 22.1 22.1 27.3 16 29.5C9.9 27.3 5.5 22.1 5.5 15.5V7.5L16 3.5Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5C12.2 9.5 9.2 12.4 9.2 16C9.2 17.5 9.7 18.8 10.6 19.9L9.8 22.8L12.8 22C13.8 22.5 14.9 22.8 16 22.8C19.8 22.8 22.8 19.9 22.8 16.3C22.8 12.4 19.8 9.5 16 9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13 16.1L15.1 18.2L19.4 13.9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

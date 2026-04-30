// Minimal stroke icons for sidebar section headers — match the
// Claude-style ghost-icon look (1.5px stroke, currentColor).

const baseProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const IconFolder = () => (
  <svg {...baseProps}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

export const IconCalendar = () => (
  <svg {...baseProps}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconStar = () => (
  <svg {...baseProps}>
    <path d="M12 3l2.6 5.5 6 .9-4.4 4.3 1 6-5.2-2.9L6.8 19.7l1-6L3.4 9.4l6-.9z" />
  </svg>
);

export const IconChart = () => (
  <svg {...baseProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18" />
  </svg>
);

export const IconStack = () => (
  <svg {...baseProps}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
    <path d="M3 17l9 5 9-5" />
  </svg>
);

export const IconSparkles = () => (
  <svg {...baseProps}>
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
    <path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8L16.5 18.5l1.8-.7z" />
  </svg>
);

export const IconTarget = () => (
  <svg {...baseProps}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);

export const IconUser = () => (
  <svg {...baseProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </svg>
);

// Sidebar / panel icon used for the collapse toggle — matches the
// screenshot's top-bar aesthetic.
export const IconSidebar = () => (
  <svg {...baseProps}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

// Three horizontal sliders with off-center thumbs — used for Orb Settings
// (it's a panel of preference toggles).
export const IconSliders = () => (
  <svg {...baseProps}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <circle cx="15" cy="6" r="2.25" fill="currentColor" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <circle cx="9" cy="12" r="2.25" fill="currentColor" />
    <line x1="3" y1="18" x2="21" y2="18" />
    <circle cx="17" cy="18" r="2.25" fill="currentColor" />
  </svg>
);

export const IconGlobe = () => (
  <svg {...baseProps}>
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3 12h18" />
  </svg>
);

export const IconSaturn = () => (
  <svg {...baseProps}>
    <defs>
      {/* Hide the back half of the ring inside the planet (the upper lens
          from y=5.5 to y=9). Sweep=0 traces the upper planet arc. */}
      <mask id="tw-saturn-back" maskUnits="userSpaceOnUse">
        <rect x="0" y="0" width="24" height="24" fill="#fff" />
        <path d="M6.23 9 A6.5 6.5 0 0 0 17.77 9 Z" fill="#000" />
      </mask>
    </defs>
    <ellipse
      cx="12"
      cy="9"
      rx="11"
      ry="2.6"
      transform="rotate(-18 12 9)"
      mask="url(#tw-saturn-back)"
    />
    <circle cx="12" cy="12" r="6.5" />
  </svg>
);

export const IconSun = () => (
  <svg {...baseProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = () => (
  <svg {...baseProps}>
    <path d="M21 12.8A9 9 0 0 1 11.2 3a7 7 0 1 0 9.8 9.8z" />
  </svg>
);

// Flat ink-line icons for board tile types -- replaces default emoji so tiles
// match the flat parchment/vintage palette instead of colorful modern glyphs.
// Single style throughout: stroke = currentColor, no fill, rounded joins.

const common = {
  viewBox: "0 0 20 20",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconHome(props) {
  return (
    <svg {...common} {...props}>
      <path d="M3 9.5 10 3l7 6.5" />
      <path d="M5 8v8h10V8" />
      <path d="M8 16v-4h4v4" />
    </svg>
  );
}

export function IconTax(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v7M12 7.7c-.5-.5-1.3-.8-2-.8-1.2 0-2.2.7-2.2 1.6s1 1.4 2.2 1.6c1.2.2 2.2.7 2.2 1.6S9 13.3 7.8 12.7" />
    </svg>
  );
}

export function IconSurprise(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2" transform="rotate(45 10 10)" />
      <path d="M8.3 8.2c.2-1 1-1.7 2-1.6 1 .1 1.7.9 1.6 1.8-.1.8-.7 1.1-1.2 1.5-.5.4-.8.7-.8 1.4" />
      <circle cx="10" cy="13.4" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTreasure(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="8" width="14" height="8" rx="1" />
      <path d="M3 8c0-2.8 3.1-5 7-5s7 2.2 7 5" />
      <path d="M10 3v13M3 11h14" />
    </svg>
  );
}

export function IconTransit(props) {
  return (
    <svg {...common} {...props}>
      <rect x="4" y="4" width="12" height="10" rx="2.5" />
      <path d="M4 9h12" />
      <circle cx="7" cy="16.3" r="0.9" />
      <circle cx="13" cy="16.3" r="0.9" />
      <path d="M7 4v-1M13 4v-1" />
    </svg>
  );
}

export function IconUtility(props) {
  return (
    <svg {...common} {...props}>
      <path d="M11 2 5 11h4l-1 7 7-10h-4z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRest(props) {
  return (
    <svg {...common} {...props}>
      <path d="M10 17V9" />
      <path d="M10 9C6 9 4 6.5 4 3c3.5 0 6 1.8 6 6Z" />
      <path d="M10 12C13.2 12 15 10 15 7c-2.8 0-5 1.3-5 5Z" />
    </svg>
  );
}

export function IconHolding(props) {
  return (
    <svg {...common} {...props}>
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  );
}

export function IconGoToHolding(props) {
  return (
    <svg {...common} {...props}>
      <path d="M10 2v8" />
      <path d="M6.5 7 10 10.3 13.5 7" />
      <rect x="4" y="11.5" width="12" height="6" rx="1" />
      <path d="M7 11.5v6M10 11.5v6M13 11.5v6" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

export function IconDice(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2.5" />
      <circle cx="7" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTrophy(props) {
  return (
    <svg {...common} {...props}>
      <path d="M6 4h8v5a4 4 0 0 1-8 0Z" />
      <path d="M6 5H4a2 2 0 0 0 2 4M14 5h2a2 2 0 0 1-2 4" />
      <path d="M10 13v2M7 17h6M8 17v-2h4v2" />
    </svg>
  );
}

export function IconCopy(props) {
  return (
    <svg {...common} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-8A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14H7" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}

export const TILE_ICON = {
  start: IconHome,
  tax: IconTax,
  surprise: IconSurprise,
  treasure: IconTreasure,
  transit: IconTransit,
  utility: IconUtility,
  rest: IconRest,
  holding: IconHolding,
  go_to_holding: IconGoToHolding,
};

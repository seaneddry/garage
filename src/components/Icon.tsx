const paths: Record<string, string> = {
  car: 'M5 13l1.6-4.5A2 2 0 0 1 8.5 7h7a2 2 0 0 1 1.9 1.5L19 13M4 13h16v4a1 1 0 0 1-1 1h-1M6 18H5a1 1 0 0 1-1-1v-4M7 18a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M14 18a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  fuel: 'M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M3 20h12M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h4',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.4-.4-2.6 2.4-2.4Z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  doc: 'M7 3h7l5 5v13H7V3ZM14 3v5h5M10 13h6M10 17h6',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  gauge: 'M12 14l4-4M4.9 19a9 9 0 1 1 14.2 0',
  image: 'M4 5h16v14H4V5ZM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  'chevron-left': 'm15 5-7 7 7 7',
  'chevron-right': 'm9 5 7 7-7 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  flag: 'M6 21V4m0 0h11l-2 4 2 4H6',
  tag: 'M3 12V4h8l10 10-8 8L3 12ZM7.5 8.5h.01',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2ZM16 14h.01',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M5 15v4h14v-4',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M5 19h14',
  logout: 'M10 5H5v14h5M15 8l4 4-4 4M19 12H9',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4',
  clip: 'm20 12-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6',
  sparkle: 'M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z',
  'arrow-up': 'M12 19V5m0 0-6 6m6-6 6 6',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
};

interface IconProps {
  name: keyof typeof paths | string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

// src/data/levels.ts
// The seven Learn-to-Swim Badge levels. Colours are sampled from the official
// syllabus colour blocks; badge art is the official badge for each level
// (placed in /public/badges/). Used across the public site for the level
// pathway, level cards, and per-level accents.

export interface Level {
  level: number;
  key: string;
  name: string;
  color: string;   // official per-level accent
  badge: string;   // path under /public
  blurb: string;   // short summary drawn from the syllabus objectives
}

export const BRAND_TEAL = '#09B3CA';

export const LEVELS: Level[] = [
  { level: 1, key: 'starfish',   name: 'Starfish',   color: '#FF7042', badge: '/badges/level-1.png', blurb: 'Water familiarisation, floating, and first safe entries and exits.' },
  { level: 2, key: 'sea-turtle', name: 'Sea Turtle', color: '#26A59A', badge: '/badges/level-2.png', blurb: 'Front and back mobility, flutter kick, and wall survival skills.' },
  { level: 3, key: 'guppy',      name: 'Guppy',      color: '#00ACC1', badge: '/badges/level-3.png', blurb: 'Front crawl with breathing, push-and-glide, and deep-water treading.' },
  { level: 4, key: 'octopus',    name: 'Octopus',    color: '#E43834', badge: '/badges/level-4.png', blurb: 'Bilateral breathing, backstroke, breaststroke kick, and sit dives.' },
  { level: 5, key: 'frog',       name: 'Frog',       color: '#66BA69', badge: '/badges/level-5.png', blurb: 'Breaststroke, dolphin kick, sculling, and forward and back flip turns.' },
  { level: 6, key: 'swordfish',  name: 'Swordfish',  color: '#1D87E4', badge: '/badges/level-6.png', blurb: 'All four strokes, butterfly, tumble and open turns, and standing dives.' },
  { level: 7, key: 'dolphin',    name: 'Dolphin',    color: '#5D34B1', badge: '/badges/level-7.png', blurb: 'Competition-ready strokes, individual medley, and timed performance swims.' },
];

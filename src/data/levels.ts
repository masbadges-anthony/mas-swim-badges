// src/data/levels.ts
// The seven Learn-to-Swim Badge levels. Colours are sampled from the official
// syllabus colour blocks; badge art is the official badge for each level
// (placed in /public/badges/). `blurb` is the short home-strip line; `outcome`
// is the fuller "can do" summary used on The Programme page.

export interface Level {
  level: number;
  key: string;
  name: string;
  color: string;
  badge: string;
  blurb: string;
  outcome: string;
}

export const BRAND_TEAL = '#09B3CA';

export const LEVELS: Level[] = [
  { level: 1, key: 'starfish',   name: 'Starfish',   color: '#FF7042', badge: '/badges/level-1.png',
    blurb: 'Water familiarisation, floating, and first safe entries and exits.',
    outcome: 'Comfortable and safe in the water — breath control, front and back floating, gliding, and safe entries and exits.' },
  { level: 2, key: 'sea-turtle', name: 'Sea Turtle', color: '#26A59A', badge: '/badges/level-2.png',
    blurb: 'Front and back mobility, flutter kick, and wall survival skills.',
    outcome: 'Self-rescue to the wall, with the first front- and back-stroke shapes and a streamlined flutter kick.' },
  { level: 3, key: 'guppy',      name: 'Guppy',      color: '#00ACC1', badge: '/badges/level-3.png',
    blurb: 'Front crawl with breathing, push-and-glide, and deep-water treading.',
    outcome: 'Front crawl with breathing, backstroke, a streamlined push-and-glide, and treading deep water for 30 seconds.' },
  { level: 4, key: 'octopus',    name: 'Octopus',    color: '#E43834', badge: '/badges/level-4.png',
    blurb: 'Bilateral breathing, backstroke, breaststroke kick, and sit dives.',
    outcome: 'Front crawl with bilateral breathing, backstroke, breaststroke kick, a sit dive, and survival backstroke.' },
  { level: 5, key: 'frog',       name: 'Frog',       color: '#66BA69', badge: '/badges/level-5.png',
    blurb: 'Breaststroke, dolphin kick, sculling, and forward and back flip turns.',
    outcome: 'Full breaststroke, dolphin kick, sculling, forward and backward flip turns, and a squat dive.' },
  { level: 6, key: 'swordfish',  name: 'Swordfish',  color: '#1D87E4', badge: '/badges/level-6.png',
    blurb: 'All four strokes, butterfly, tumble and open turns, and standing dives.',
    outcome: 'All four strokes including butterfly, breaststroke pullout, tumble and open turns, standing dives, and sidestroke.' },
  { level: 7, key: 'dolphin',    name: 'Dolphin',    color: '#5D34B1', badge: '/badges/level-7.png',
    blurb: 'Competition-ready strokes, individual medley, and timed performance swims.',
    outcome: 'All four strokes to competition distance, individual medley, racing starts and turns, and timed qualifications.' },
];

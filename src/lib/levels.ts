// The seven levels, with the brand accent each badge carries on the printed
// artwork. Declared 1->7 so `order` matches the swim pathway.

export type BadgeLevel =
  | 'starfish'
  | 'sea_turtle'
  | 'guppy'
  | 'octopus'
  | 'frog'
  | 'swordfish'
  | 'dolphin';

export interface LevelMeta {
  order: number;
  label: string;   // animal name as printed
  accent: string;  // per-level badge accent
}

export const LEVELS: Record<BadgeLevel, LevelMeta> = {
  starfish:   { order: 1, label: 'Starfish',   accent: '#F2783C' },
  sea_turtle: { order: 2, label: 'Sea Turtle', accent: '#3FA45B' },
  guppy:      { order: 3, label: 'Guppy',      accent: '#27B2A0' },
  octopus:    { order: 4, label: 'Octopus',    accent: '#E5503D' },
  frog:       { order: 5, label: 'Frog',       accent: '#7BB23E' },
  swordfish:  { order: 6, label: 'Swordfish',  accent: '#2E7CC4' },
  dolphin:    { order: 7, label: 'Dolphin',    accent: '#1FA3DC' },
};

export function levelMeta(level: BadgeLevel): LevelMeta {
  return LEVELS[level] ?? { order: 0, label: level, accent: '#0a1f44' };
}

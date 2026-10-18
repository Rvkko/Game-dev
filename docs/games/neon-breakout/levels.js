/**
 * NEON BREAKOUT — hand-authored level data.
 *
 * Every row string is exactly 13 characters (COLS = 13).
 * Legend:
 *   '.'  empty
 *   '1'  standard brick        (1 hit)
 *   '2'  reinforced brick      (2 hits)
 *   '3'  armoured brick        (3 hits — pierce/laser chew through it faster)
 *   'x'  explosive brick       (1 hit, detonates a 3x3 blast, chains)
 *   '#'  steel plate           (indestructible, not required for clear)
 *   'p'  cache brick           (1 hit, ALWAYS drops a power-up)
 *   'P'  reinforced cache      (2 hits, ALWAYS drops a power-up)
 *
 * Levels 10, 20 and 30 are boss stages: their first rows are intentionally
 * empty to leave the boss its patrol lane.
 */

export const COLS = 13;

export const LEVELS = [
  { name: 'FIRST LIGHT', rows: [
    '1111111111111',
    '1111111111111',
    '..111111111..',
  ] },
  { name: 'TWIN PEAKS', rows: [
    '......1......',
    '.....111.....',
    '....11111....',
    '...1111111...',
    '..111111111..',
    '.11111111111.',
  ] },
  { name: 'INTERLACE', rows: [
    '1.1.1.1.1.1.1',
    '.1.1.1.1.1.1.',
    '1.1.1.1.1.1.1',
    '.1.1.1.1.1.1.',
    '1.1.1.1.1.1.1',
  ] },
  { name: 'FORTIFY', rows: [
    '2222222222222',
    '1111111111111',
    '1111111111111',
    '....p...p....',
  ] },
  { name: 'DETONATION 101', rows: [
    '1111111111111',
    '11x11111x1111',
    '1111111111111',
    '..1.1.1.1.1..',
  ] },
  { name: 'THE WALL', rows: [
    '2222222222222',
    '1111111111111',
    '#####...#####',
    '...11111111..',
  ] },
  { name: 'CUT DIAMOND', rows: [
    '......1......',
    '.....121.....',
    '....12321....',
    '...1232321...',
    '....12321....',
    '.....121.....',
    '......1......',
  ] },
  { name: 'PILLARS', rows: [
    '2.2.2.2.2.2.2',
    '2.2.2.2.2.2.2',
    '1.1.1.1.1.1.1',
    '111111p111111',
    '1111111111111',
  ] },
  { name: 'MINEFIELD', rows: [
    '1x1.1x1.1x1.1',
    '1111111111111',
    '.2.2.2.2.2.2.',
    '1111111111111',
    '1.x.1.1.1.x.1',
  ] },
  { name: 'SENTINEL PRIME', boss: 10, rows: [
    '.............',
    '.............',
    '.............',
    '#...........#',
    '2...........2',
    '1...........1',
  ] },
  { name: 'ZIGZAG', rows: [
    '2222.........',
    '.....1111....',
    '.........2222',
    '1111.........',
    '.....PPPP....',
    '.........1111',
  ] },
  { name: 'ARMOURED CORE', rows: [
    '3333333333333',
    '1111111111111',
    '33.........33',
    '1111111111111',
    '....33333....',
  ] },
  { name: 'HOURGLASS', rows: [
    '2222222222222',
    '.11111111111.',
    '..222222222..',
    '...1111111...',
    '....22222....',
    '...1111111...',
    '..222222222..',
  ] },
  { name: 'CROSSFIRE', rows: [
    '....1.1.1....',
    '....23332....',
    '1111111111111',
    '..x.12321.x..',
    '1111111111111',
    '....23332....',
    '....1.1.1....',
  ] },
  { name: 'BUNKER', rows: [
    '#############',
    '1111111111111',
    '1..2.....2..1',
    '1.x.......x.1',
    '1111111111111',
    '..1.p.p.p.1..',
  ] },
  { name: 'NEON RAIN', rows: [
    '1.1.1.1.1.1.1',
    '2.2.2.2.2.2.2',
    '3.3.3.3.3.3.3',
    '2.2.2.2.2.2.2',
    '1.1.1.1.1.1.1',
    '.p.........p.',
  ] },
  { name: 'SPLIT CHAMBERS', rows: [
    '222222.222222',
    '1111.....1111',
    '11..#####..11',
    '1111.....1111',
    '222222x222222',
  ] },
  { name: 'SPIRAL', rows: [
    '1111111111111',
    '1...........1',
    '1.222222222.1',
    '1.2.......2.1',
    '1.2.3p3p3.2.1',
    '1.2.......2.1',
    '1.222222222.1',
    '1...........1',
  ] },
  { name: 'OVERLOAD', rows: [
    'x1x1x1x1x1x1x',
    '1111111111111',
    '2222222222222',
    '1111111111111',
    'x1x1x1x1x1x1x',
  ] },
  { name: 'VOID WARDEN', boss: 20, rows: [
    '.............',
    '.............',
    '.............',
    '3...........3',
    '#...........#',
    '2.2.2.2.2.2.2',
    '1111111111111',
  ] },
  { name: 'LATTICE', rows: [
    '2.1.2.1.2.1.2',
    '.3.2.3.2.3.2.',
    '2.1.2.1.2.1.2',
    '.3.2.3.2.3.2.',
    '2.1.2.1.2.1.2',
    '..p.......p..',
  ] },
  { name: 'CHEVRON', rows: [
    '11.........11',
    '221.......122',
    '3221.....1223',
    '.3221...1223.',
    '..3221.1223..',
    '...32111123..',
  ] },
  { name: 'STEEL RAIN', rows: [
    '#.#.#.#.#.#.#',
    '1111111111111',
    '2.2.2.2.2.2.2',
    '1111111111111',
    '3.3.3.3.3.3.3',
    '11111p1p11111',
  ] },
  { name: 'DETONATOR', rows: [
    '1111111111111',
    '1x1x1x1x1x1x1',
    '1111111111111',
    '3333333333333',
    '1x1.1x1.1x1.1',
    '1111111111111',
  ] },
  { name: 'THE VAULT', rows: [
    '3333333333333',
    '3...........3',
    '3.####.####.3',
    '3.#..ppp..#.3',
    '3.####.####.3',
    '3...........3',
    '3.222222222.3',
  ] },
  { name: 'GAUNTLET', rows: [
    '2222222222222',
    '1.1.1.1.1.1.1',
    '3333333333333',
    '1.1.1.1.1.1.1',
    '22222P2P22222',
    '1.1.1.1.1.1.1',
    'x...........x',
  ] },
  { name: 'NOVA', rows: [
    '......3......',
    '.....323.....',
    '....32223....',
    '...3222223...',
    '..321x1x123..',
    '...3222223...',
    '....32P23....',
    '.....323.....',
  ] },
  { name: 'IRON CURTAIN', rows: [
    '#############',
    '3333333333333',
    '2222222222222',
    '1111111111111',
    '#####...#####',
    '..111x2x111..',
  ] },
  { name: 'CHAOS ENGINE', rows: [
    '3x3x3x3x3x3x3',
    '1212121212121',
    'x1x1x1x1x1x1x',
    '2121212121212',
    '3.3.3.3.3.3.3',
    '11111P1P11111',
    '.p.........p.',
  ] },
  { name: 'NEON OVERLORD', boss: 30, rows: [
    '.............',
    '.............',
    '.............',
    '3...x...x...3',
    '#...........#',
    '2.2.2.2.2.2.2',
    '1111111111111',
    '33.........33',
  ] },
];

/** Boss stat blocks, keyed by level number. */
export const BOSSES = {
  10: {
    name: 'SENTINEL PRIME', hp: 55, w: 208, h: 70,
    speed: 132, bombRate: 2.5, bombSpeed: 215,
    color: '#ff4fd8', accent: '#ffd0f6',
    taunt: 'A slow, heavy guardian. Keep a ball in the air and punish the turns.',
  },
  20: {
    name: 'VOID WARDEN', hp: 92, w: 226, h: 74,
    speed: 168, bombRate: 1.95, bombSpeed: 250,
    color: '#9b6bff', accent: '#dccaff',
    taunt: 'Faster, meaner, and it spits twin bombs when wounded.',
  },
  30: {
    name: 'NEON OVERLORD', hp: 138, w: 246, h: 80,
    speed: 202, bombRate: 1.5, bombSpeed: 292,
    color: '#ff8a3d', accent: '#ffe0bd',
    taunt: 'The final core. Triple-spread barrages below half health.',
  },
};

/** Per-brick base score, used for scoring and for the 3-star par calculation. */
export const BRICK_BASE_SCORE = { normal: 100, tough: 150, armour: 220, boom: 180, cache: 130 };

export function charToBrick(ch) {
  switch (ch) {
    case '1': return { type: 'normal', hp: 1, cache: false };
    case '2': return { type: 'tough', hp: 2, cache: false };
    case '3': return { type: 'armour', hp: 3, cache: false };
    case 'x': return { type: 'boom', hp: 1, cache: false };
    case '#': return { type: 'steel', hp: Infinity, cache: false };
    case 'p': return { type: 'cache', hp: 1, cache: true };
    case 'P': return { type: 'cache', hp: 2, cache: true };
    default: return null;
  }
}

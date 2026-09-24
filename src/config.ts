// Dimensions globales de la ville (mètres). Tout est aligné sur la grille voxel V.
export const V = 0.5;            // taille d'un voxel
export const LEVEL = 12;         // écart entre niveaux praticables (terrasses, passerelles)
export const STRATUM = 48;       // strates "civiques" : niveaux privilégiés pour les passerelles
export const BLOCKS = 10;        // îlots par axe
export const ROAD = 18;          // largeur de chaussée
export const PITCH = 96;         // pas de la grille urbaine
export const BLOCK = PITCH - ROAD;
export const SIDEWALK = 4;
export const ALLEY = 6;
export const HALF = (BLOCKS * PITCH) / 2;
export const PLINTH = 0.5;       // hauteur des trottoirs / dalles d'îlot
export const CLOUD_Y = 300;
export const NUM_PL = 24;        // lumières ponctuelles actives simultanément
export const CHUNK = 128;
export const FAR_CHUNK = 512;

// Rastérisation des abris pour la pluie
export const RAIN_RES = 512;
export const RAIN_EXTENT = 1024; // couvre [-512, 512]

export const STYLE = {
  SOLID: 0,
  GRID: 1,
  RIBBON: 2,
  DENSE: 3,
  FINS: 4,
  EMISSIVE: 5,
  SIGN: 6,
  SCREEN: 7,
  GROUND: 8,
  SHOP: 9,
  FOLIAGE: 10,
  WATER: 11,
  DECK: 12,
  HERITAGE: 13,   // brique et pierre, hautes fenêtres (vieux quartiers)
  CURTAIN: 14,    // mur-rideau vitré (sièges de corporations)
  INDUSTRIAL: 15, // bardage ondulé, fenêtres en bandeau
  CAPSULE: 16,    // modules à hublots empilés
  BOOKS: 17,      // rayonnages de livres
  FENCE: 18,      // grillage (motif découpé)
} as const;

/** Altitude à partir de laquelle la ville devient "luxueuse" (terrasses, toits, façades). */
export const LUX_Y = 140;

export type RGB = [number, number, number];

export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export const NEON: RGB[] = [
  hex(0xff2a9d), // magenta
  hex(0x00e5ff), // cyan
  hex(0xa64dff), // violet
  hex(0xffb000), // ambre
  hex(0x6aff4f), // vert acide
  hex(0xff3b3b), // rouge
  hex(0x3d7bff), // bleu électrique
  hex(0xff6a1f), // orange
];

export const CONCRETE: RGB[] = [
  hex(0x2c2c33),
  hex(0x24262d),
  hex(0x2f3336),
  hex(0x332c2a),
  hex(0x1f2228),
  hex(0x2a2f3a),
  hex(0x38343a),
];

/** Cycle des feux tricolores (s) : axe x vert [0, GREEN), orange jusqu'à CYCLE/2, puis rouge. Axe z décalé de CYCLE/2. */
export const CYCLE = 26;
export const GREEN = 11;

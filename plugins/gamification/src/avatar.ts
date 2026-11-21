/**
 * Pixel-art avatar spec. v1 ships AI-generated placeholder sprites made to this exact spec,
 * so real art can replace them later with no code changes.
 *
 * Each layer is a PNG sprite sheet of FRAME_SIZE x FRAME_SIZE frames plus a JSON frame map
 * (Aseprite export). Rows are animations in ANIMATIONS order.
 */
export const FRAME_SIZE = 32;

export const SPECIES = ['chicken', 'cat', 'dog'] as const;
export type Species = (typeof SPECIES)[number];

export const ANIMATIONS = ['idle', 'walk', 'smash', 'celebrate', 'level-up'] as const;
export type Animation = (typeof ANIMATIONS)[number];

export type Slot = 'outfit' | 'shoes' | 'racket' | 'headwear' | 'effect';

/** Where accessories attach, per species, in pixels from the frame's top-left (idle frame 0). */
export interface AnchorPoints {
  head: [number, number];
  body: [number, number];
  /** The paw or wing that holds the racket */
  hand: [number, number];
  feet: [number, number];
}

export const ANCHORS: Record<Species, AnchorPoints> = {
  chicken: { head: [16, 7], body: [16, 18], hand: [24, 17], feet: [16, 29] },
  cat: { head: [16, 8], body: [16, 19], hand: [25, 18], feet: [16, 30] },
  dog: { head: [15, 8], body: [16, 19], hand: [25, 19], feet: [16, 30] },
};

export const SLOT_ANCHOR: Record<Slot, keyof AnchorPoints> = {
  headwear: 'head',
  outfit: 'body',
  racket: 'hand',
  shoes: 'feet',
  effect: 'body',
};

export interface AvatarState {
  species: Species;
  colourVariant: number;
  equipped: Partial<Record<Slot, string>>; // slot -> item id
}

/** Draw order, back to front. */
export const LAYER_ORDER: Array<'base' | Slot> = [
  'effect',
  'base',
  'shoes',
  'outfit',
  'headwear',
  'racket',
];

export function isSpecies(x: string): x is Species {
  return (SPECIES as readonly string[]).includes(x);
}

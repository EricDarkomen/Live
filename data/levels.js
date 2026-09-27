'use strict';
/* The level catalogue. One entry per place you can stand. The island itself
 * (data/island.js) adds itself to this at load time.
 *
 *   hub   the level the work happens on — the bar stools ring here
 *   site  somewhere the bar can reach you while it is open
 */

const LEVELS = {
  /* THE DRIFTWOOD. Twelve stools, a deck over the water, a jukebox that only
     plays one song properly, and a till with your name on it now. */
  bar: {
    name: 'The Driftwood',
    w: 34, h: 16,
    site: true,
    hub: true,
    rooms: [
      { z: 'barroom', r: [2, 2, 21, 13] },
      { z: 'deck', r: [23, 2, 31, 13] },
    ],
    doors: [
      { x: 22, y: 6, z: 'deck', name: 'The Deck' },
      { x: 22, y: 7, z: 'deck', name: 'The Deck' },
    ],
    counters: [{ x: 4, y: 4, w: 13, label: 'THE DRIFTWOOD' }],
    entries: {
      door: [10.5, 12.5],
      start: [10.5, 3.5],
    },
    links: [
      { via: 'barOut', to: 'island', entry: 'bar' },
    ],
    furnish() {
      const A = o => this.add(o);
      A({ x: 10, y: 13, e: '🚪', name: 'Out to the Promenade', kind: 'exit', solid: false, use: 'barOut' });
      /* Behind the bar. */
      A({ x: 9, y: 4, e: '💵', name: 'The till', kind: 'till', solid: true, use: 'playerDesk' });
      A({ x: 12, y: 4, e: '🍺', name: 'The taps', kind: 'taps', solid: true, use: 'taps' });
      A({ x: 14, y: 4, e: '🍹', name: 'The blender', kind: 'blender', solid: true, use: 'blender' });
      A({ x: 6, y: 4, e: '🧊', name: 'The ice well', kind: 'misc', solid: true, use: 'iceWell' });
      A({ x: 5, y: 2, e: '🍾', name: 'The top shelf', kind: 'bottles', solid: true, use: 'topShelf' });
      A({ x: 11, y: 2, e: '🥃', name: 'The rum wall', kind: 'bottles', solid: true, use: 'topShelf' });
      A({ x: 16, y: 2, e: '📋', name: 'The cocktail board', kind: 'board', solid: true, use: 'cocktailBoard' });
      /* The stools. A guest waiting on one rings its bell. */
      [4, 6, 8, 10, 12, 14, 16].forEach((x, i) =>
        A({ x, y: 5, e: '🛎️', name: 'Bar stool ' + (i + 1), kind: 'phone', solid: true, use: 'stool', ringing: false }));
      /* The room. */
      A({ x: 19, y: 3, e: '🎵', name: 'The jukebox', kind: 'jukebox', solid: true, use: 'jukebox' });
      A({ x: 5, y: 9, e: '🍽️', name: 'A table', kind: 'table', solid: true, use: 'barTable' });
      A({ x: 6, y: 9, e: '🍽️', name: 'A table', kind: 'table', solid: true, use: 'barTable' });
      A({ x: 13, y: 10, e: '🍽️', name: 'A table', kind: 'table', solid: true, use: 'barTable' });
      A({ x: 14, y: 10, e: '🍽️', name: 'A table', kind: 'table', solid: true, use: 'barTable' });
      A({ x: 3, y: 12, e: '🛋️', name: 'The snug', kind: 'sofa', solid: true, use: 'snug' });
      A({ x: 20, y: 12, e: '🪴', name: 'A monstera', kind: 'plant', solid: true, use: 'plant' });
      A({ x: 2, y: 6, e: '🖼️', name: 'Old photographs', kind: 'art', solid: true, use: 'photos' });
      A({ x: 18, y: 8, e: '🎯', name: 'The dartboard', kind: 'misc', solid: true, use: 'darts' });
      /* The deck. */
      A({ x: 30, y: 3, e: '🔭', name: 'The telescope', kind: 'misc', solid: true, use: 'telescope' });
      A({ x: 25, y: 4, e: '🏮', name: 'Fairy lights', kind: 'torch', solid: true, use: 'fairyLights' });
      A({ x: 29, y: 12, e: '🛏️', name: 'The hammock', kind: 'hammock', solid: false, use: 'hammock' });
      A({ x: 25, y: 10, e: '🪑', name: 'A deckchair', kind: 'lounger', solid: true, use: 'deckchair' });
      A({ x: 27, y: 10, e: '🪑', name: 'A deckchair', kind: 'lounger', solid: true, use: 'deckchair' });
      A({ x: 31, y: 7, e: '🌊', name: 'The rail', kind: 'railing', solid: true, use: 'rail' });
      A({ x: 24, y: 12, e: '🎧', name: 'The DJ booth', kind: 'misc', solid: true, use: 'djBooth' });
    }
  },

  /* HOME. One room, one bed, one wardrobe that is mostly swimwear. */
  villa: {
    name: 'Your Beach Hut',
    w: 20, h: 13,
    rooms: [{ z: 'hut', r: [2, 2, 17, 10] }],
    doors: [],
    entries: { door: [9.5, 9.5] },
    links: [{ via: 'villaOut', to: 'island', entry: 'villa' }],
    furnish() {
      const A = o => this.add(o);
      A({ x: 9, y: 10, e: '🚪', name: 'Out to the Promenade', kind: 'exit', solid: false, use: 'villaOut' });
      A({ x: 4, y: 3, e: '🛏️', name: 'Your bed', kind: 'bed', solid: true, use: 'bed' });
      A({ x: 8, y: 2, e: '👙', name: 'The wardrobe', kind: 'wardrobe', solid: true, use: 'wardrobe' });
      A({ x: 10, y: 2, e: '🪞', name: 'The mirror', kind: 'mirror', solid: true, use: 'mirror' });
      A({ x: 15, y: 3, e: '🚿', name: 'The outdoor shower', kind: 'misc', solid: true, use: 'shower' });
      A({ x: 13, y: 7, e: '🧊', name: 'The fridge', kind: 'fridge', solid: true, use: 'hutFridge' });
      A({ x: 16, y: 9, e: '🌺', name: 'A hibiscus', kind: 'plant', solid: true, use: 'plant' });
      A({ x: 3, y: 8, e: '🎸', name: 'A ukulele', kind: 'misc', solid: true, use: 'ukulele' });
      A({ x: 6, y: 6, e: '📦', name: 'Uncle Rafa’s box', kind: 'box', solid: true, use: 'rafaBox' });
    }
  },

  /* MAMA COCO'S. Seeds, sun cream, and the island's only reliable gossip. */
  market: {
    name: 'Mama Coco’s',
    w: 18, h: 12,
    rooms: [{ z: 'shopfloor', r: [2, 2, 15, 9] }],
    doors: [],
    counters: [{ x: 4, y: 4, w: 6, label: 'MAMA COCO’S' }],
    entries: { door: [8.5, 8.5] },
    links: [{ via: 'marketOut', to: 'island', entry: 'market' }],
    furnish() {
      const A = o => this.add(o);
      A({ x: 8, y: 9, e: '🚪', name: 'Out to the Promenade', kind: 'exit', solid: false, use: 'marketOut' });
      A({ x: 6, y: 4, e: '💰', name: 'The till', kind: 'till', solid: true, use: 'marketTill' });
      A({ x: 2, y: 7, e: '🌱', name: 'The seed rack', kind: 'shelf', solid: true, use: 'seedRack' });
      A({ x: 15, y: 7, e: '🧴', name: 'Sun cream and sundries', kind: 'shelf', solid: true, use: 'shelves' });
      A({ x: 13, y: 3, e: '🍉', name: 'Fruit crates', kind: 'crate', solid: true, use: 'fruitCrates' });
      A({ x: 14, y: 3, e: '🥭', name: 'Fruit crates', kind: 'crate', solid: true, use: 'fruitCrates' });
      A({ x: 11, y: 8, e: '🌺', name: 'A flower bucket', kind: 'plant', solid: true, use: 'flowerBucket' });
    }
  },
};

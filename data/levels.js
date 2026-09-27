'use strict';
/* The level catalogue. One entry per place you can stand. Levels built by a
 * generator (data/street.js) add themselves to it at load time.
 */

const LEVELS = {
  lobby: {
    name: 'Reception',
    w: 24, h: 14,
    arrive: true,
    site: true,
    rooms: [{ z: 'lobby', r: [2, 2, 21, 11] }],
    doors: [],
    counters: [{ x: 5, y: 4, w: 5, label: 'RECEPTION' }],
    entries: {
      start: [11.5, 9.5],
      doors: [11.5, 10.5],
      lift: [14.5, 3.5],
      stairs: [18.5, 3.5],
    },
    links: [
      { via: 'exitDoor', to: 'street', entry: 'doors' },
      { via: 'liftTo1', to: 'floor', entry: 'lift' },
      { via: 'stairsUp', to: 'floor', entry: 'stairs' },
    ],
    furnish() {
      const A = o => this.add(o);
      A({ x: 11, y: 11, e: '🚪', name: 'The front doors', kind: 'exit', solid: false, use: 'exitDoor' });
      A({ x: 7, y: 4, e: '🛎️', name: 'Reception', kind: 'recep', solid: true, use: 'reception' });
      A({ x: 14, y: 2, e: '🛗', name: 'The lift', kind: 'lift', solid: true, use: 'lift' });
      A({ x: 18, y: 2, e: '🪜', name: 'The stairs up', kind: 'stairs', solid: false, use: 'stairsUp' });
      A({ x: 3, y: 9, e: '🛋️', name: 'A sofa', kind: 'sofa', solid: true, use: 'sofa' });
      A({ x: 20, y: 9, e: '🪴', name: 'A plant', kind: 'plant', solid: true, use: 'plant' });
      A({ x: 3, y: 2, e: '📋', name: 'The directory', kind: 'board', solid: true, use: 'directory' });
    }
  },
  floor: {
    name: 'The Floor',
    w: 40, h: 30,
    site: true,
    hub: true,
    rooms: [
      { z: 'floor', r: [2, 2, 29, 20] },
      { z: 'kitchen', r: [31, 2, 37, 10] },
      { z: 'washroom', r: [31, 12, 37, 20] },
      { z: 'meeting', r: [2, 22, 17, 27] },
      { z: 'landing', r: [19, 22, 27, 27] },
    ],
    doors: [
      { x: 30, y: 6, z: 'kitchen', name: 'The Kitchen' },
      { x: 30, y: 16, z: 'washroom', name: 'The Washroom' },
      { x: 9, y: 21, z: 'meeting', name: 'The Meeting Room' },
      { x: 10, y: 21, z: 'meeting', name: 'The Meeting Room' },
      { x: 23, y: 21, z: 'landing', name: 'The Landing' },
    ],
    entries: {
      lift: [22.5, 24.5],
      stairs: [25.5, 24.5],
      fire: [3.5, 9.5],
      start: [22.5, 24.5],
    },
    links: [
      { via: 'liftToG', to: 'lobby', entry: 'lift' },
      { via: 'stairsDown', to: 'lobby', entry: 'stairs' },
      { via: 'fireExit', to: 'street', entry: 'fire' },
    ],
    furnish() {
      const A = o => this.add(o);
      A({ x: 5, y: 5, e: '🖥️', name: 'Workstation 1', kind: 'pc', solid: true, use: 'pc', deskId: 'd1' });
      A({ x: 6, y: 5, e: '☎️', name: 'Desk phone 1', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd1' });
      A({ x: 5, y: 6, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd1' });
      A({ x: 10, y: 5, e: '🖥️', name: 'Workstation 2', kind: 'pc', solid: true, use: 'pc', deskId: 'd2' });
      A({ x: 11, y: 5, e: '☎️', name: 'Desk phone 2', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd2' });
      A({ x: 10, y: 6, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd2' });
      A({ x: 15, y: 5, e: '🖥️', name: 'Workstation 3', kind: 'pc', solid: true, use: 'pc', deskId: 'd3' });
      A({ x: 16, y: 5, e: '☎️', name: 'Desk phone 3', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd3' });
      A({ x: 15, y: 6, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd3' });
      A({ x: 20, y: 5, e: '🖥️', name: 'Workstation 4', kind: 'pc', solid: true, use: 'pc', deskId: 'd4' });
      A({ x: 21, y: 5, e: '☎️', name: 'Desk phone 4', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd4' });
      A({ x: 20, y: 6, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd4' });
      A({ x: 25, y: 5, e: '🖥️', name: 'Workstation 5', kind: 'pc', solid: true, use: 'pc', deskId: 'd5' });
      A({ x: 26, y: 5, e: '☎️', name: 'Desk phone 5', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd5' });
      A({ x: 25, y: 6, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd5' });
      A({ x: 5, y: 11, e: '🖥️', name: 'Workstation 6', kind: 'pc', solid: true, use: 'pc', deskId: 'd6' });
      A({ x: 6, y: 11, e: '☎️', name: 'Desk phone 6', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd6' });
      A({ x: 5, y: 12, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd6' });
      A({ x: 10, y: 11, e: '🖥️', name: 'Your workstation', kind: 'pc', solid: true, use: 'playerDesk', deskId: 'd7' });
      A({ x: 11, y: 11, e: '☎️', name: 'Your phone', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd7' });
      A({ x: 10, y: 12, e: '🪑', name: 'Your desk', kind: 'chair', solid: false, use: 'playerDesk', deskId: 'd7' });
      A({ x: 15, y: 11, e: '🖥️', name: 'Workstation 8', kind: 'pc', solid: true, use: 'pc', deskId: 'd8' });
      A({ x: 16, y: 11, e: '☎️', name: 'Desk phone 8', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd8' });
      A({ x: 15, y: 12, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd8' });
      A({ x: 20, y: 11, e: '🖥️', name: 'Workstation 9', kind: 'pc', solid: true, use: 'pc', deskId: 'd9' });
      A({ x: 21, y: 11, e: '☎️', name: 'Desk phone 9', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd9' });
      A({ x: 20, y: 12, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd9' });
      A({ x: 25, y: 11, e: '🖥️', name: 'Workstation 10', kind: 'pc', solid: true, use: 'pc', deskId: 'd10' });
      A({ x: 26, y: 11, e: '☎️', name: 'Desk phone 10', kind: 'phone', solid: true, use: 'phone', ringing: false, deskId: 'd10' });
      A({ x: 25, y: 12, e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair', deskId: 'd10' });
      A({ x: 27, y: 2, e: '🖨️', name: 'The copier', kind: 'printer', solid: true, use: 'printer',
        furn: { size: 30, sprite: 'obj.mopier' } });
      A({ x: 2, y: 15, e: '🖨️', name: 'A desk printer', kind: 'printer', solid: true, use: 'printer' });
      A({ x: 3, y: 2, e: '📋', name: 'Noticeboard', kind: 'board', solid: true, use: 'noticeboard' });
      A({ x: 2, y: 9, e: '🚪', name: 'The fire exit', kind: 'exit', solid: false, use: 'fireExit' });
      A({ x: 29, y: 19, e: '🪴', name: 'A plant', kind: 'plant', solid: true, use: 'plant' });
      A({ x: 13, y: 20, e: '🗄️', name: 'Filing cabinet', kind: 'cab', solid: true, use: 'filing' });
      A({ x: 33, y: 2, e: '☕', name: 'Coffee machine', kind: 'coffee', solid: true, use: 'coffee' });
      A({ x: 34, y: 2, e: '🫖', name: 'The kettle', kind: 'kettle', solid: true, use: 'kettle' });
      A({ x: 36, y: 2, e: '🧊', name: 'The fridge', kind: 'fridge', solid: true, use: 'fridge' });
      A({ x: 37, y: 7, e: '🥤', name: 'Vending machine', kind: 'vend', solid: true, use: 'vending' });
      A({ x: 33, y: 6, e: '🍽️', name: 'The kitchen table', kind: 'table', solid: true, use: 'kitchenTable' });
      A({ x: 34, y: 6, e: '🍽️', name: 'The kitchen table', kind: 'table', solid: true, use: 'kitchenTable' });
      A({ x: 36, y: 12, e: '🚽', name: 'Cubicle', kind: 'loo', solid: false, use: 'loo' });
      A({ x: 37, y: 12, e: '🚽', name: 'Cubicle', kind: 'loo', solid: false, use: 'loo' });
      A({ x: 32, y: 20, e: '🚰', name: 'Basin', kind: 'sink', solid: true, use: 'sink' });
      A({ x: 33, y: 20, e: '🚰', name: 'Basin', kind: 'sink', solid: true, use: 'sink' });
      A({ x: 8, y: 24, e: '🍽️', name: 'The meeting table', kind: 'table', solid: true, use: 'meetingTable' });
      A({ x: 8, y: 24, e: '📄', name: 'Somebody’s notes', kind: 'paper', solid: false, use: 'meetingNotes' });
      A({ x: 9, y: 24, e: '🍽️', name: 'The meeting table', kind: 'table', solid: true, use: 'meetingTable' });
      A({ x: 10, y: 24, e: '🍽️', name: 'The meeting table', kind: 'table', solid: true, use: 'meetingTable' });
      A({ x: 3, y: 22, e: '📋', name: 'The whiteboard', kind: 'board', solid: true, use: 'whiteboard' });
      A({ x: 16, y: 22, e: '🖥️', name: 'The old terminal', kind: 'pc', solid: true, use: 'oldTerminal' });
      A({ x: 16, y: 27, e: '🔌', name: 'The cable box', kind: 'box', solid: true, use: 'cables' });
      A({ x: 21, y: 22, e: '🛗', name: 'The lift', kind: 'lift', solid: true, use: 'lift' });
      A({ x: 26, y: 22, e: '🪜', name: 'The stairs down', kind: 'stairs', solid: false, use: 'stairsDown' });
      A({ x: 20, y: 27, e: '📦', name: 'The supplies cupboard', kind: 'cupboard', solid: true, use: 'cupboard' });
      /* The renderer draws a surface and a partition per desk. */
      this.desks = [
        { x: 5, y: 5, w: 2, mine: false },
        { x: 10, y: 5, w: 2, mine: false },
        { x: 15, y: 5, w: 2, mine: false },
        { x: 20, y: 5, w: 2, mine: false },
        { x: 25, y: 5, w: 2, mine: false },
        { x: 5, y: 11, w: 2, mine: false },
        { x: 10, y: 11, w: 2, mine: true },
        { x: 15, y: 11, w: 2, mine: false },
        { x: 20, y: 11, w: 2, mine: false },
        { x: 25, y: 11, w: 2, mine: false },
      ];
    }
  },
  shop: {
    name: 'The Shop',
    w: 14, h: 10,
    rooms: [{ z: 'shopfloor', r: [2, 2, 11, 7] }],
    doors: [],
    counters: [{ x: 4, y: 4, w: 5, label: 'TILL' }],
    entries: { door: [7.5, 6.5] },
    links: [{ via: 'shopOut', to: 'street', entry: 'shop' }],
    furnish() {
      const A = o => this.add(o);
      A({ x: 7, y: 8, e: '🚪', name: 'The door', kind: 'exit', solid: false, use: 'shopOut' });
      A({ x: 6, y: 4, e: '💷', name: 'The till', kind: 'pc', solid: true, use: 'shopTill' });
      A({ x: 2, y: 7, e: '🗄️', name: 'Shelves', kind: 'shelf', solid: true, use: 'shelves' });
      A({ x: 11, y: 7, e: '🗄️', name: 'Shelves', kind: 'shelf', solid: true, use: 'shelves' });
    }
  },
};

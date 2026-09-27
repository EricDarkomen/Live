# Bum Bay 🏝️💩

A cute, crude little island farming game for your phone. Paradise. Mostly. It smells a bit.

Grow beans, feed chickens, scoop seagull poop, can your wind and ship it all off to
Captain Pantsless and friends at the pier.

## Play

Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000 on your phone
```

Add it to your home screen for a full-screen app feel. The game saves itself, and
everything keeps growing while you're away.

## How it plays

- 🌱 **Fields** — tap an empty field to plant; swipe across ripe crops to harvest.
- 🐔 **Animals** — tap to feed them, tap again to collect what they… produce.
- 🏭 **Buildings** — turn crops into posh stuff: Baked Beans, Bum Burner Sauce, Loo Roll, Canned Wind.
- ⛵ **Boats** — fill orders at the pier for coins and XP.
- 💩 **Seagulls** — poop on your island. Scoop it; sometimes it's golden (✨💩 skips timers).
- 🔒 **Land** — buy more island at the signs as you level up.
- 🦩 **Decorations** — make customers tip more.

Drag to pan, pinch (or scroll) to zoom.

## Code

No build step, no dependencies. Everything is in `bay/`:

| File | What |
| --- | --- |
| `bay/data.js` | Items, crops, animals, buildings, decor, customers, quests |
| `bay/game.js` | State, rules, orders, quests, saving |
| `bay/render.js` | Isometric canvas renderer and effects |
| `bay/ui.js` | HUD, sheets, sound, touch input |
| `bay/main.js` | Boot and main loop |
| `bay/bay.css` | Styles |

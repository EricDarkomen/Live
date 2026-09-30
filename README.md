# Tan Lines

**Sun, sand & questionable decisions.** A top-down island game for the browser —
phone or desktop.

Your Uncle Rafa has run off to Bali and left you **The Driftwood**, a beach bar
on the Caribbean island of Isla Solana: a leaking roof, a bartender called Mari
who has run the place for six years, a garden gone wild, and a man in a white
linen suit who very much wants to buy it.

- **Serve at the bar.** Guests ring the bells on the stools. Serving is
  turn-based: read the tell, pick the move that answers it, build chemistry,
  and seal the deal — hen parties, honeymooners, sunburnt tourists, a handsome
  stranger who says "surprise me".
- **Grow the fruit.** Rafa's fifteen plots grow mint, limes, strawberries,
  mangoes, pineapples and coconuts in real island time — if you look after
  them. Crops only grow while they are watered, and the sun dries them out;
  fill Rafa's can at the rain butt, and ration it when the rain stays away.
  Shoo the pests, dig in compost for faster, bigger harvests, and pick things
  before they rot on the vine. Blend them into mojitos, daiquiris, piña
  coladas and the house special.
- **Keep it fresh.** Fruit spoils. The bar fridge slows it right down (when
  it is not sulking), and Mari stocks the bar from it every morning — a
  stocked bar tips better. What spoils becomes scraps; the compost bin turns
  scraps into compost; the drying rack turns fruit into dried goods that keep
  for ever and ship to the other islands. Mama Coco will buy your surplus.
- **Eat.** You get hungry. Your own mangoes will do. The **Farm** tab (`O`)
  shows the garden, the water, the stores and what is cooking.
- **Gather, chop, mine, build.** Rafa's yard is behind the garden: a
  workbench, a kiln, and a board of plans he never finished. Driftwood and
  shells wash up on every beach, loose stones lie about inland, palms drop
  fronds and jungle trees have vines. Twist rope, lash a stone axe and a
  pickaxe, fell palms for timber (the stumps grow back), break rock outcrops
  for stone, clay and iron ore, and fire charcoal, bricks, iron and tiki mugs
  in the kiln. Then build at the 🚧 sites round the island: more garden plots,
  a rain catcher, a second compost bay, a bigger drying rack, a brick oven,
  beach cabanas that rent to tourists, and — at last — the bar roof. Every
  trade levels with practice, every job costs time and energy, and tools wear
  out. The **Workshop** tab (`Y`) shows your trades, tools, materials and plans.
- **Ship it.** The supply boat at the jetty takes orders for the other islands
  and pays cash.
- **Fall for somebody.** Flirt, share a drink, and ask Mari, Kai, Jade, Luca,
  Nico or Amara to the lantern at Lovers' Cove after sunset.
- **Meet the island.** Nico lands the dawn catch at the end of the jetty and
  has been feuding with Teo over a bollard for fifteen years. Dr. Amara Osei
  counts parrotfish at the cove and would like Blake Sterling to leave. Rosie
  feeds the plaza from her taco truck and is in an eleven-year price war with
  Mama Coco. Pepe's grandson Tito wants to be a DJ — help him practise and he
  will play his first set. And Val, Blake's assistant, knows more than she is
  supposed to.
- **Get to know them.** Everybody on the island has needs — energy, a cold
  drink, fun, company, and a passion of their own (Kai's stoke, Luca's groove,
  Mama Coco's gossip) — and a mood built out of those and of whatever has
  happened to them lately. When the day leaves them free they go and do
  something about it; when it all gets too much they have a moment; when it
  is going brilliantly they are inspired, and a flirt goes further. They
  run **routines** — Mari opens up and calls last orders, Kai teaches the
  morning lesson, Jade puts the flags out, Teo unloads the boat — and weigh
  what matters most: an emergency beats a duty, a duty beats a coffee break,
  and nobody starts something they cannot finish before their next shift.
  They **grow**: skills level up with practice (and with you — ask them to
  show you how they do it), make them quicker, and unlock new routines. The
  **Islanders** tab (`U`) shows how everybody you have met is doing, what
  they are up to, and how far they have come.
- **Jump in.** Hop about, wade out from any beach and swim the shallows or the
  hidden lagoon, duck-dive under the surface, and cannonball off the jetty.
- **Explore.** A road loop round the island, a beach buggy to drive it in, a
  plaza, a yoga deck, a hidden lagoon in the jungle, a water pistol at the
  surf shack, and a wardrobe of swimwear at your beach hut.
- **Keep it — or don't.** Win over a two-million-follower influencer, then face
  Blake Sterling's offer. Three endings.

The bar is open 11:00–19:00; after that it is golden hour, sunset at 20:15, and
the night is yours. The game saves itself.

It runs on the engine that shipped with this repository — pathfinding
islanders with their own days and minds of their own (needs, moods, thoughts
and opinions of each other, in the spirit of Oxygen Not Included and
RimWorld — see `engine/mind.js`), branching dialogue, jobs, skills, weather,
traffic, driving, three arcade minigames, a map — and the Liberated Pixel Cup
character art, including beachwear derived from it (see `art/CREDITS.md`).

## Running it

Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

|            | Keyboard                        | Touch                          |
| ---------- | ------------------------------- | ------------------------------ |
| Move       | `W A S D` or arrows             | thumb down anywhere bottom-left |
| Interact   | `E` or `Enter`                  | `E` button                     |
| Jump       | `Space` — in the water it dives | `JUMP` button (`DIVE` when swimming) |
| Drive      | `W` go · `S` brake, then reverse · `A D` steer · `H` horn | **two sticks**: left steers, right is the throttle |
| Get out    | `E`                             | `OUT`                          |
| Take it out | `G` · `Q` swaps · `R` reloads   | grab the green stick           |
| Aim, fire, swing | the mouse and its button, or the arrows | **two sticks**: left walks, right aims and fires |
| Dialogue   | `Space`, `1`–`9` to choose      | tap the box, tap a reply       |
| The map    | `N`, or the minimap             | `☰` · Map                      |
| Panels     | `J I K O Y U P L`, `T` for today’s takings, `Esc` for settings — one window, a sidebar of sections | `☰` opens a launcher of every section |
| Comms      | `M` post · `C` island chat · `V` texts · `B` the log, or the chips in the corner | the `📨` chip under the bar |
| Pop-ups    | `☰ · Menu → Notifications`: everything / only what needs you / nothing | same |
| Save/load  | `F5` / `F9`                     | `☰` · Menu                     |

On a phone the movement control is a floating analogue stick: it appears
wherever your thumb lands in the bottom-left of the screen, goes in every
direction rather than four, and how far you push it is how fast you walk. A
four-way d-pad is available instead, and the whole layout mirrors for
left-handers — both are in `☰ · Menu`, along with a fullscreen toggle. Starting
a game asks for fullscreen on its own.

Get in a car and a **second stick** appears in the other corner, in amber: the
left one steers and the right one is the throttle — push it up to go, pull it
down to brake and then reverse. One stick could not do both. Steering meant
pushing sideways, pushing sideways took the forward component out of the same
vector, and less speed means less steering bite — so the harder you asked it to
turn, the less it turned. Two thumbs, two jobs, neither able to undo the other.
The button you have been pressing all along stays exactly where it is and says
`OUT`.

Pick up something to throw or swing and a **third stick** appears in that same corner, in
green, on exactly the throttle's terms: only while there is something in your
pocket, never at the same time as the throttle, and gone again the moment you
get into a car. Push it and you aim; push it past halfway and it goes off —
which is a dart, a band, a jet of water, or a foam sword through ninety degrees
of somebody's morning, depending on what is in your hand. Let go and the thing
goes back in your pocket a couple of seconds later, because a phone has no
spare corner for a holster button and does not need one.

On a keyboard the arrows become the right hand while something is out — `W A S
D` walks you about and the arrows aim and fire, which is how Robotron did it in
1982 and is still the only way two directions fit on one keyboard. The mouse
does the same job more directly: where the pointer is is where you are aiming,
and the button is the trigger. Nobody has to choose: the stick is asked first,
then the arrows, then the mouse, so picking one up never means putting another
down.

The game saves itself, and detects touch devices to show the right controls and
the right instructions.

## The editor

Serve the folder and open `editor.html` — its own page, deliberately, so the game
itself is untouched and loads nothing from it. It draws with the game's own
renderer, so what you see is what the player gets, and it edits ten documents:
levels, jobs, people and what they say, the kinds of object, art, rooms, the
day's messages, rewards, encounters and the minigames. Every one of them checks
itself as you edit — the faults that matter are the ones you cannot see on
screen — and writes its source back out.

**Publish to GitHub**, on the whole-game sheet, commits the finished files into a
repository as a single commit. On a published copy it offers the repository the
page was served from. **Point it at the private source repository instead** —
the published one is rebuilt from the private one on every release, so anything
committed straight into it is overwritten by the next one. Use a fine-grained
token with Contents: read and write on that one repository.

```sh
python3 -m http.server 8000    # then http://localhost:8000/editor.html
```

## Where things are

| | |
| --- | --- |
| `data/game.js` | The name, the hours, the weather, and every line the engine speaks |
| `data/world.js` | Zones, ground surfaces, vehicles, furniture, waypoints |
| `data/island.js` | Isla Solana itself, built from rules: coast, beaches, roads, jetty, cove, lagoon |
| `data/levels.js` | The Driftwood, your beach hut, Mama Coco's |
| `data/npcs.js` | The islanders and everything they say |
| `data/minds.js` | How the islanders feel and grow: needs, passions, quirks, friendships, skills, routines, and their moods in their own words |
| `data/callers.js` | Bar guests, messages, moves, and the two big encounters |
| `data/garden.js` | The garden, the blender, the supply boat's orders, and dates |
| `data/craft.js` | Gathering, woodcutting, mining, the workbench and kiln, tools, trades, and building from Rafa's plans |
| `data/farm.js` | Water, pests, spoilage and the fridge, the compost bin and drying rack, hunger, and stocking the bar |
| `data/items.js` | Items, skills, jobs, achievements, minigame cabinets, shops |
| `data/office.js` | Happenings, the island chat, post, texts, endings, the opening |
| `data/acts.js` | What every object does when you press E |

## Licence

Four parts, because there are four kinds of thing here. See [LICENSE](LICENSE).

**The game** — engine, editor, code, writing, design. Copyright © 2026 Grant van Zyl,
licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) —
share and link it freely, but not commercially and not modified.

**The sprites** — the people and their swimwear, the furniture, the road surface, the pavement,
the awnings — are not ours. They are pixel art from the
[Liberated Pixel Cup](https://lpc.opengameart.org/) community, used under
[OGA-BY 3.0](https://static.opengameart.org/OGA-BY-3.0.txt) and **modified**
(composited, recoloured, cropped). Artists and sources are listed in
[art/CREDITS.md](art/CREDITS.md). That art is *not* covered by the game's
NonCommercial or NoDerivatives terms — the PNGs in `art/sprites/` are the clean
copies to take if you want them.

Most of the sheets above use only assets offered under OGA-BY 3.0 or CC0,
deliberately: neither carries a ShareAlike term, so using them costs
attribution and nothing else. The sprite build tool (`tools/build-sprites.mjs`,
which lives in the private source repository — `tools/` is deliberately not
published, see `LICENSE`) re-checks that against upstream's own licence data on
every build and refuses to produce a sheet if it stops being true.

ShareAlike art is not banned outright — it is kept in files of its own, and
there are five of them across two parts. `art/sprites/sanitary.png` has always
been one: a CC-BY-SA 3.0 tileset, in a sheet nothing else is packed into, under
its own terms in `LICENSE` part 3. `art/sprites/wood.png` is the second, and it
is the first one the build tool makes rather than carries; `frontage.png` (the
shop windows) and `roofs.png` (the roofs of the whole town) are the third and
fourth, on the same terms in the same part, each in a PNG nothing else is packed
into. `LICENSE` part 4 and `art/sprites/victorian.png` are the fifth, and they
are a **different** ShareAlike: CC-BY-SA 4.0, which that submission offers and
nothing else.

Two ShareAlike parts rather than one, because 3.0 and 4.0 are not the same
licence and a section claiming to cover both would be wrong about one of them —
they differ on how an Adaptation may be relicensed, on how attribution and
notice must be given, and on whether a breach can be cured. Compatibility also
runs one way: merging the two sheets would quietly relicense the part-3 art
under 4.0, which is not ours to do to somebody else's work. So each gets its
own part, its own PNG, and `assertOnePart()` refusing to write a sheet that
mixes anything with anything. `CREDITS.md` marks each non-part-2 sheet in the
list at the top of it, so the OGA-BY sentence underneath is not quietly
covering something it does not cover. See `LICENSE` for the full terms of each
part.

**The fonts** — Fredoka and Nunito, in `art/fonts/` — are not ours either.
They are used unmodified under the [SIL Open Font License 1.1](art/fonts/),
whose full text is beside them, and are not covered by the game's licence.

A work of fiction; its places, people and companies are invented.

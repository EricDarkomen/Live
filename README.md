# Untitled

A top-down browser RPG, and the engine and editor it is built on.

This is the starting point for a new game: every system is here and working — a
building of several floors with a lift and stairs, a street outside with
traffic, crossings and pedestrians, colleagues who keep their own day, branching
dialogue, jobs, inventory and skills, turn-based encounters on the phone, by
email and by text, a queue of work that arrives on its own, a day/night clock
with seasons and weather, cars you can drive, three arcade minigames, a map, a
save — with a small placeholder world in it where a story will go.

Play it in a browser. A page, its content and a directory of art — no build
step, no dependencies, no network calls.

## Running it

Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

|            | Keyboard                        | Touch                          |
| ---------- | ------------------------------- | ------------------------------ |
| Move       | `W A S D` or arrows             | thumb down anywhere bottom-left |
| Interact   | `E`                             | `E` button                     |
| Drive      | `W` go · `S` brake, then reverse · `A D` steer · `H` horn | **two sticks**: left steers, right is the throttle |
| Get out    | `E`                             | `OUT`                          |
| Take it out | `G` · `Q` swaps · `R` reloads   | grab the green stick           |
| Aim, fire, swing | the mouse and its button, or the arrows | **two sticks**: left walks, right aims and fires |
| Dialogue   | `Space`, `1`–`9` to choose      | tap the box, tap a reply       |
| The map    | `N`, or the minimap             | `☰` · Map                      |
| Panels     | `J I K P L`, `T` for today's figures, `Esc` for menu | `☰`            |
| Comms      | `M` mail · `C` chat · `V` texts · `B` the log, or the chips in the corner | the `📨` chip under the bar |
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

## Licence

Four parts, because there are four kinds of thing here. See [LICENSE](LICENSE).

**The game** — engine, editor, code, writing, design. Copyright © 2026 Grant van Zyl,
licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) —
share and link it freely, but not commercially and not modified.

**The sprites** — the people, the office kit, the road surface, the pavement,
the awnings — are not ours. They are pixel art from the
[Liberated Pixel Cup](https://lpc.opengameart.org/) community, used under
[OGA-BY 3.0](https://static.opengameart.org/OGA-BY-3.0.txt) and **modified**
(composited, recoloured, cropped). Artists and sources are listed in
[art/CREDITS.md](art/CREDITS.md). That art is *not* covered by the game's
NonCommercial or NoDerivatives terms — the PNGs in `art/sprites/` are the clean
copies to take if you want them.

Most of the sheets above use only assets offered under OGA-BY 3.0 or CC0,
deliberately: neither carries a ShareAlike term, so using them costs
attribution and nothing else. `tools/build-sprites.mjs` re-checks that against
upstream's own licence data on every build and refuses to produce a sheet if it
stops being true.

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
covering something it does not cover. See `LICENSE`, and the build section
above.

A work of fiction; its places, people and companies are invented.

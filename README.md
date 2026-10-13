# Dig Anywhere

Pokémon FireRed's Kanto as one continuous overworld, where **Dig** works the way Fly does. Open the
start menu, pick **MAP**, put the cursor on a town, and a Pokémon tunnels you there under the real
map while the location banner ticks past each route (PALLET TOWN, ROUTE 17, ROUTE 18, FUCHSIA CITY).
You pop out in front of the destination's Pokémon Center. When one stretch of sea links your shore to
the town, you can **Surf** there instead, half submerged on Lapras, Gyarados, Wailmer, Dewgong or
Milotic.

Unofficial fan project. Not affiliated with or endorsed by Nintendo, Game Freak, Creatures, The Pokémon Company, Mojang or Microsoft.

## What this repository contains

Only original code and tools. No graphics, maps, fonts, music or sounds from the games are included.
The code does contain a few short pieces of in-game text and some game values written in by hand
(such as tile behaviour codes and wild level ranges).
`./setup.sh` fetches the public decompilation projects at pinned commits and builds the game's
assets on your machine. Third-party assets are fetched and built locally and never included here,
and `.gitignore` keeps them out of commits.

Everything the game draws for itself (the underground soil and rock, the dug-up mound, the tunnel
trail, water ripples, the ball burst, the location banner) is drawn in code, and every sound is
synthesized in the browser.

## Setup

You need `bash`, `git` 2.25 or newer, Python 3.10 to 3.13 with `venv`, and network access to
github.com and pypi.org.

```bash
git clone https://github.com/Mozetech/dig-anywhere
cd dig-anywhere
./setup.sh
python3 serve.py
```

Then open http://localhost:4700 (`python3 serve.py 8000` picks another port).

A first run takes about a minute (43 seconds in testing) and uses about
70 MB of disk: 10 MB of upstream sources in `vendor/`, 55 MB for `.venv/` and 5 MB of built `assets/`.
It does this:

1. Fetches [pret/pokefirered](https://github.com/pret/pokefirered) at `c75f352` and
   [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) at
   `160396e` into `vendor/`. The fetch is shallow, sparse and blobless, so only the 666 files the
   build reads are downloaded (640 and 26).
2. Checks each of those files against its SHA-1 in `tools/upstream-inputs.tsv`.
3. Creates `.venv/` with numpy 2.2.2 and Pillow 11.1.0.
4. Runs `tools/build_assets.py`, which writes 276 files into `assets/`: 19 sprite sheets, the
   region map, window frame and font, and the stitched world (collision and behaviour grids plus 246
   map chunks of 512 px).
5. Checks every built file against `tools/assets.tsv`. With the pinned Pillow they are
   byte-identical to the reference build. Another Pillow may compress PNGs differently, so PNGs that
   differ in bytes are accepted when their decoded pixels match.

Running it again skips whatever is already done and verified. Options:

| Option | What it does |
| --- | --- |
| `--rebuild` | build `assets/` again even if it verifies |
| `--prune` | delete `vendor/` and `.venv/` afterwards; `assets/` (5 MB) is all the game needs |
| `POKEFIRERED_SRC=<dir>` | fetch pret/pokefirered from a local clone that has the pinned commit, not GitHub |
| `EXPANSION_SRC=<dir>` | the same for pokeemerald-expansion |
| `PYTHON=<python>` | build the venv with this interpreter |

On Python 3.14 or newer the pinned wheels do not exist, so setup installs the current numpy and
Pillow and the pixel check applies.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Walk |
| Enter | Start menu |
| Z / Space | Confirm |
| X / Esc | Back |

On touch devices an on-screen pad appears.

## How it works

The build renders each map's metatiles (the bottom layer and the above-sprites top layer
separately), places the 37 outdoor maps by walking their connections from Pallet Town, fills the gaps
between maps with each map's border block, clears the surf rocks out of the sea, and writes 512 px
chunk images plus collision and behaviour grids.

When you pick a town on the region map, the game checks whether one connected body of water links
your shore to that town's shore (a breadth-first search over the real water tiles, so ponds do not
count). If it does, a DIG / SURF / CANCEL window appears; otherwise you dig straight away. Diggers
rotate between Diglett, Dugtrio, Sandshrew, Sandslash, Drilbur and Excadrill, and holes close up
three seconds after you climb out. Surf follows the water route and lands you on the nearest shore of
the destination. Every trip starts with the Poké Ball throw and release burst, and Surf ends with the
Pokémon being recalled to its ball. Your buddy is Squirtle.

## Showcase video (optional)

```bash
npm install
node tools/render_video.mjs
```

Drives the game one frame at a time through headless Google Chrome and writes
`out/surf-anywhere.mp4` with ffmpeg: three surf legs (Pallet to Cinnabar to Fuchsia and back to
Pallet) on a different Pokémon each time. It needs the built `assets/`, Google Chrome and ffmpeg.

## Layout

- `setup.sh` fetch, check, build and verify
- `tools/build_assets.py` decompilation sources to runtime assets
- `tools/verify.py`, `tools/upstream-inputs.tsv`, `tools/assets.tsv` hash checks (hashes only)
- `tools/render_video.mjs` the showcase video
- `src/main.js` game loop, state machine, the dig and surf sequences
- `src/world.js` collision, metatile behaviours, map areas, water routes
- `src/render.js` chunk renderer and the underground view
- `src/ui.js` start menu, region map, banner, message box
- `src/font.js` bitmap font with its real advance widths
- `serve.py` local static server

`window.__dig` exposes headless hooks (`pause`, `step`, `press`, `hold`, `tick`, `digTo`, `surfTo`,
`teleport`).

## Credits

- [pret/pokefirered](https://github.com/pret/pokefirered), the FireRed decompilation: every outdoor
  Kanto map with its layouts and connections, the tilesets, Red's overworld sprites, the Poké Ball,
  the region map, the start-menu window frame and the latin_normal font with its glyph widths.
- [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) and the
  artists credited there: the follower-style overworld sprites of Pikachu, Squirtle, the six diggers
  and the five surfers.

Pokémon and all related names are trademarks of Nintendo, Game Freak, Creatures and The Pokémon
Company.

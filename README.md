# Monifactory Calculator

A calculator for [Monifactory](https://www.curseforge.com/minecraft/modpacks/monifactory) recipes and production chains.
It is adapted from the Star Technology calculator, which in turn was adapted from the
[GregTech: New Horizons calculator](https://github.com/ShadowTheAge/gtnh) by ShadowTheAge.
Large parts of this project were written using AI assistance, so code style and quality are all over the place.

Targets Monifactory **0.13.8** (Minecraft 1.20.1, Forge, GTCEu 7.5.3).

## Development

```bash
npm install
npm start      # dev server on http://localhost:5500
npm test       # builds with tsc, then runs jest against data/data.bin (and data/data-hard.bin if present)
npm run build  # production build into dist/
```

`data/data.bin` and `data/atlas.webp` are committed and generated from a Monifactory instance.
See [export/README.md](export/README.md) for how to regenerate them.

## Normal / Hard recipe modes

The calculator can load either recipe set:

| Mode   | Recipe data          | Icons                         |
|--------|----------------------|-------------------------------|
| Normal | `data/data.bin`      | `data/atlas.webp`             |
| Hard   | `data/data-hard.bin` | `data/atlas-hard.webp`         |

The mode is chosen with the "Recipes" select in the menu. It is resolved in this order:
URL parameter `?mode=normal|hard`, then the `difficulty` value in localStorage, then Normal.
Changing the select saves the choice, updates `?mode=` (a shared `#...` page link is kept) and reloads the page.
Saved pages reference recipe ids, so a page made in one mode may show missing recipes in the other.

If `data/data-hard.bin` is not present, Hard mode shows a loading error and its tests are skipped.

## Notes on machine modelling

Multiblock behaviour is derived from each machine's exported recipe-modifier ids
(`oc_perfect`, `ebf_oc`, `parallel_hatch`, ...), see `src/machines.ts`. Multiblocks whose
modifiers are not modelled (for example addon machines such as the Mega Blast Furnace) are
shown with a default non-perfect overclock and an informational note.

## License

The code is under the MIT License - see the [LICENSE](LICENSE) file for details.

This project is a derivative work of [ShadowTheAge/gtnh](https://github.com/ShadowTheAge/gtnh)
(the GregTech: New Horizons calculator, MIT License, Copyright (c) 2025 ShadowTheAge).
The original copyright and license notice are retained in [LICENSE](LICENSE).

The project contains assets from Minecraft (Mojang trademark and copyright), the Monifactory
team, and respective mod authors. These assets are used under fair use.

Font used: [F77 Minecraft by 123467](https://www.fontspace.com/f77-minecraft-font-f30628)

# Monifactory Data Export Process

How to regenerate `data/data.bin` and `data/atlas.webp`.

## Prerequisites

- .NET SDK 8.0 or later
- A **clean** Monifactory instance (do not use a language-patch resource pack/mod: item names must be English)
- The recipe data exporter mod, built from source against GTCEu 7.5.3
  (the upstream `recipe-data-exporter` targets the Star Technology GTM fork and must be ported;
  see the Monifactory port for the required changes: GTCEu 7.5.3 jar instead of `gtceu-st`,
  Create handlers removed, modifier ids derived from `GTRecipeModifiers` field names)
- JDK 17 to build the mod, JDK 21 for the ModDevGradle tooling

## Step 1: Export from Minecraft

The exporter reads recipes through the **JEI** API, and GTCEu only registers its JEI plugin when
JEI (not EMI) is the recipe viewer. So in a *copy* of the instance:

1. Remove `emi-*`, `emi_loot-*` and `toomanyrecipeviewers-*` from `mods/`.
2. Add `jei-1.20.1-forge-15.59.0.210.jar` and the built exporter jar.
3. Set `lang:en_us` in `options.txt`.
4. Start the game, open a world, wait for JEI to finish loading, then run `/export-data`.
5. The result is written to `<instance>/minecraft/local/export`
   (`items.json`, `fluids.json`, `recipeTypes.json`, `recipes/`, `tags/`, `images/`).

## Step 2: Process the export

```bash
dotnet run --project export/export.csproj -c Release -- "<path to local/export>" --output data
```

Arguments:
- `<path>`: required, the `local/export` directory
- `--output <path>`: where to write `data.bin` and `atlas.webp` (default: current directory)
- `--skipIcons`: skip building the texture atlas
- `--previous <path>`: previous `data.bin`, to keep old/obsolete recipes

## Sanity checks

`npm test` includes a smoke test that solves a sample recipe on every multiblock with modifiers
and asserts that the data contains no Star Technology content.

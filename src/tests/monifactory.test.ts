import { Repository, Item, Recipe } from '../repository';
import { PageModel, RecipeModel } from '../page';
import { SolvePage } from '../solver';
import { setupRepository } from './setup';
import { TIER_LUV } from '../utils';

function solve(recipeId: string, crafter: string, voltageTier: number): RecipeModel {
    const page = new PageModel({
        name: 'Test',
        products: [],
        rootGroup: {
            type: 'recipe_group',
            links: {},
            elements: [{ type: 'recipe', recipeId, voltageTier, fixedCrafterCount: 1, crafter, choices: {} }],
        },
    });
    SolvePage(page);
    return page.rootGroup.elements[0] as RecipeModel;
}

function allRecipes(): Recipe[] {
    const repo: any = Repository.current;
    return Array.from(repo.recipes as Int32Array).map((ptr: number) => repo.GetObject(ptr, Recipe));
}

describe('Monifactory data', () => {
    beforeAll(async () => {
        await setupRepository();
    });

    it('loads GTCEu items and fluids with English names', () => {
        expect(Repository.current.GetById<Item>('i:gtceu:electric_blast_furnace:0')?.name).toBe('Electric Blast Furnace');
        expect((Repository.current.GetById<any>('f:gtceu:steam'))?.name).toBe('Steam');
    });

    it('exports the stock GTCEu modifier ids for multiblocks', () => {
        const mods = (id: string) => Repository.current.GetById<Item>(id)?.recipeModifiers ?? [];
        expect(mods('i:gtceu:electric_blast_furnace:0')).toEqual(expect.arrayContaining(['ebf_oc', 'batch_mode']));
        expect(mods('i:gtceu:cracker:0')).toContain('cracker_oc');
        expect(mods('i:gtceu:pyrolyse_oven:0')).toContain('pyrolyse_oven_oc');
        expect(mods('i:gtceu:multi_smelter:0')).toContain('multi_smellter_parallel');
        expect(mods('i:gtceu:large_chemical_reactor:0')).toContain('oc_perfect_subtick');
    });

    it('contains no Star Technology content', () => {
        const repo: any = Repository.current;
        const starItems = Array.from(repo.items as Int32Array)
            .map((ptr: number) => repo.GetObject(ptr, Item) as Item)
            .filter(item => item.id.includes('start_core') || item.id.includes(':start:'));
        expect(starItems).toHaveLength(0);
    });

    it('solves a sample recipe on every multiblock crafter without errors', () => {
        const checked = new Set<string>();
        const failures: string[] = [];
        for (const recipe of allRecipes()) {
            if (!recipe.recipeType.usesEnergy)
                continue;
            for (const crafter of recipe.recipeType.multiblocks) {
                if (checked.has(crafter.id) || (crafter.recipeModifiers ?? []).length === 0)
                    continue;
                checked.add(crafter.id);
                try {
                    const model = solve(recipe.id, crafter.id, TIER_LUV);
                    if (![model.recipesPerMinute, model.powerFactor, model.overclockFactor].every(Number.isFinite))
                        failures.push(`${crafter.id}: non-finite result for ${recipe.id}`);
                } catch (error) {
                    failures.push(`${crafter.id}: ${error}`);
                }
            }
        }
        expect(checked.size).toBeGreaterThan(10);
        expect(failures).toEqual([]);
    });

    it('uses a perfect subtick overclock for the Large Chemical Reactor', () => {
        const lcr = Repository.current.GetById<Item>('i:gtceu:large_chemical_reactor:0')!;
        const recipe = allRecipes().find(r => r.recipeType.multiblocks.some(c => c.id === lcr.id) && r.recipeType.usesEnergy)!;
        const model = solve(recipe.id, lcr.id, TIER_LUV);
        expect(model.overclockFactor).toBeGreaterThan(1);
        expect(model.recipesPerMinute).toBeGreaterThan(0);
    });
});

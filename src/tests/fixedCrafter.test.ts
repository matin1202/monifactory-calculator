import { Repository, Recipe, RecipeIoType } from '../repository';
import { PageModel, RecipeModel } from '../page';
import { SolvePage } from '../solver';
import { setupRepository } from './setup';
import { TIER_LUV } from '../utils';

function allRecipes(): Recipe[] {
    const repo: any = Repository.current;
    return Array.from(repo.recipes as Int32Array).map((ptr: number) => repo.GetObject(ptr, Recipe));
}

const isOutput = (t: RecipeIoType) => t === RecipeIoType.ItemOutput || t === RecipeIoType.FluidOutput;
const isInput = (t: RecipeIoType) => t === RecipeIoType.ItemInput || t === RecipeIoType.FluidInput;

// A producer/consumer pair of energy recipes linked by exactly one item.
function findChain(): { producer: Recipe, consumer: Recipe, goodsId: string } {
    const recipes = allRecipes().filter(r => r.recipeType.usesEnergy && r.gtRecipe?.durationTicks > 0
        && r.items.every(s => isInput(s.type) || isOutput(s.type)) && r.items.every(s => s.probability === 1));
    const producers = new Map<string, Recipe>();
    for (const r of recipes)
        for (const s of r.items)
            if (isOutput(s.type) && !producers.has(s.goods.id))
                producers.set(s.goods.id, r);
    for (const consumer of recipes) {
        const inputs = consumer.items.filter(s => isInput(s.type));
        if (inputs.length !== 1)
            continue;
        const producer = producers.get(inputs[0].goods.id);
        if (!producer || producer === consumer)
            continue;
        const producerIds = new Set(producer.items.map(s => s.goods.id));
        if (consumer.items.some(s => isOutput(s.type) && producerIds.has(s.goods.id)))
            continue;
        return { producer, consumer, goodsId: inputs[0].goods.id };
    }
    throw new Error('no chain found');
}

function solveChain(producerCount: number, consumerCount?: number) {
    const { producer, consumer, goodsId } = findChain();
    const page = new PageModel({
        name: 'Test',
        products: [],
        rootGroup: {
            type: 'recipe_group',
            links: {},
            elements: [
                { type: 'recipe', recipeId: producer.id, voltageTier: TIER_LUV, fixedCrafterCount: producerCount, choices: {} },
                { type: 'recipe', recipeId: consumer.id, voltageTier: TIER_LUV, fixedCrafterCount: consumerCount, choices: {} },
            ],
        },
    });
    SolvePage(page);
    const [p, c] = page.rootGroup.elements as RecipeModel[];
    return { page, p, c, goodsId };
}

describe('Fixed crafter counts', () => {
    beforeAll(async () => {
        await setupRepository();
    });

    it('sends excess production to the output instead of failing', () => {
        // With the consumer unfixed it scales to match one producer; then fix it
        // to a fraction of that so production clearly exceeds consumption.
        const balanced = solveChain(1);
        expect(balanced.page.status).toBe('solved');
        // An unfixed consumer processes everything rather than leaving a surplus.
        expect(balanced.page.rootGroup.flow.output[balanced.goodsId]).toBeUndefined();
        const consumerCount = balanced.c.crafterCount / 3;

        const { page, p, c, goodsId } = solveChain(1, consumerCount);
        expect(page.status).toBe('solved');
        expect(p.crafterCount).toBeCloseTo(1);
        expect(c.crafterCount).toBeCloseTo(consumerCount);
        const surplus = page.rootGroup.flow.output[goodsId];
        expect(surplus).toBeCloseTo(p.flow.output[goodsId] - c.flow.input[goodsId]);
        expect(surplus).toBeGreaterThan(0);
    });

    it('still reports infeasible when consumption exceeds fixed production', () => {
        const balanced = solveChain(1);
        const { page } = solveChain(1, balanced.c.crafterCount * 3);
        expect(page.status).toBe('infeasible');
    });
});

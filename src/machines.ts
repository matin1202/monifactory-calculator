import { RecipeModel, OverclockResult } from "./page.js";
import { Fluid, Goods, Item, Recipe, RecipeInOut, RecipeIoType, RecipeType, Repository } from "./repository.js";
import { TIER_LV, TIER_MV, TIER_HV, TIER_EV, TIER_IV, TIER_LUV, TIER_ZPM, TIER_UV, TIER_UHV, TIER_UEV, TIER_UIV, TIER_UXV, CoilTierNames, CoilTiers } from "./utils.js";
import { voltageTier, getFusionTierByStartupCost, formatTicksAsTime, RotorHolderTiers, TurbineRotors, ParallelHatchTier, ParallelHatchTiers, AbsoluteParallelHatchTiers } from "./utils.js";

export type MachineCoefficient<T> = Exclude<T, Function> | ((recipe:RecipeModel, choices:{[key:string]:number}) => T);

export abstract class Overclocker {
    public abstract calculate(recipeModel:RecipeModel, overclockTiers:number): OverclockResult;
}

export class StandardOverclocker extends Overclocker{
    maxPerfect: number;
    maxNormal: number;
    multiplier: number;
    perfectLabel?: string;

    private constructor(maxPerfect:number, maxNormal:number, multiplier:number, perfectLabel?:string) {
        super();
        this.maxPerfect = maxPerfect;
        this.maxNormal = maxNormal;
        this.multiplier = multiplier;
        this.perfectLabel = perfectLabel;
    }

    static onlyPerfect(maxPerfect=MAX_OVERCLOCK, multiplier:number=4) {
        return new StandardOverclocker(maxPerfect, 0, multiplier);
    }

    static onlyNormal(maxNormal=MAX_OVERCLOCK) {
        return new StandardOverclocker(0, maxNormal, 4);
    }

    static perfectThenNormal(maxPerfect=MAX_OVERCLOCK) {
        return new StandardOverclocker(maxPerfect, MAX_OVERCLOCK, 4);
    }

    // Half-perfect overclock used by fusion reactors: each tier gives 2x speed
    // and 2x EU/t, so the energy per recipe stays the same (unlike a normal
    // overclock which doubles it). Shown in the UI as "Fusion OC xN".
    static fusion(maxFusion=MAX_OVERCLOCK) {
        return new StandardOverclocker(maxFusion, 0, 2, "Fusion OC");
    }

    public calculate(recipeModel:RecipeModel, overclockTiers:number): OverclockResult {
        let overclockSpeed = 1;
        let overclockPower = 1;
        let nameParts : string[] = [];

        if (this.maxPerfect == 0 && this.maxNormal == 0) {
            return {overclockSpeed:1, overclockPower:1, perfectOverclocks:0, overclockName: "Can't overclock"};
        } else {

            let perfectOverclocks = Math.min(this.maxPerfect, overclockTiers);
            let normalOverclocks = Math.min(this.maxNormal, overclockTiers - perfectOverclocks);

            if (perfectOverclocks > 0) {
                overclockSpeed = Math.pow(this.multiplier, perfectOverclocks);
                let showCapped = perfectOverclocks == this.maxPerfect && normalOverclocks == 0;
                let suffix = showCapped ? " (capped)" : "";
                if (this.perfectLabel) {
                    nameParts.push(this.perfectLabel + " x" + perfectOverclocks + suffix)
                } else if (this.multiplier == 4) {
                    nameParts.push("Perfect OC x" + perfectOverclocks + suffix)
                } else {
                    nameParts.push(this.multiplier + "/" + this.multiplier + " OC x" + perfectOverclocks + suffix)
                }
            }
            if (normalOverclocks > 0) {
                let showCapped = normalOverclocks == this.maxNormal;
                let suffix = showCapped ? " (capped)" : "";
                let coef = Math.pow(2, normalOverclocks);
                overclockSpeed *= coef;
                overclockPower *= coef;
                nameParts.push("OC x" + normalOverclocks + suffix)
            }

            let overclockName = nameParts.join(", ");
            return { overclockSpeed, overclockPower, perfectOverclocks, overclockName };
        }
    }
}

export class NullOverclocker extends Overclocker {
    private constructor() {
        super()
    }

    public calculate(recipeModel:RecipeModel, overclockTiers:number): OverclockResult {
        return {overclockSpeed:1, overclockPower:1, perfectOverclocks:0, overclockName: "Can't overclock"};
    }

    public static instance = new NullOverclocker();
}

export class OverclockerFromClosure extends Overclocker {
    closure: (recipe:RecipeModel, overclockTiers: number) => OverclockResult;

    constructor(closure:(recipe:RecipeModel, overclockTiers: number) => OverclockResult) {
        super();
        this.closure = closure;
    }

    public calculate(recipeModel: RecipeModel, overclockTiers: number): OverclockResult {
        return this.closure(recipeModel, overclockTiers);
    }
}

const MAX_OVERCLOCK = Number.POSITIVE_INFINITY;

export type Machine = {
    choices?: {[key:string]:Choice};
    enforceChoiceConstraints?: (recipe:RecipeModel, choices:{[key:string]:number}) => void;
    overclocker: MachineCoefficient<Overclocker>;
    speed: MachineCoefficient<number>;
    durationModifiers?: MachineCoefficient<number>[];
    power: MachineCoefficient<number>;
    parallelLimitPower?: MachineCoefficient<number>;
    parallels: MachineCoefficient<number>;
    recipe?: (recipe:RecipeModel, choices:{[key:string]:number}, items:RecipeInOut[]) => RecipeInOut[];
    info?: MachineCoefficient<string>;
    ignoreParallelLimit?: boolean;
    fixedVoltageTier?: MachineCoefficient<number>;
    overclockBaseVoltage?: MachineCoefficient<number>;
    excludesRecipe?: (recipe:Recipe) => boolean;
    roundAfterParallels?: boolean;
    subtick?: boolean;
    truncateFinalEuPerTick?: boolean;
}

export function GetParameter<T>(coefficient: MachineCoefficient<T>, recipeModel:RecipeModel): T {
    if (typeof coefficient === "function")
        return (coefficient as ((recipe:RecipeModel, choices:{[key:string]:number}) => T))(recipeModel, recipeModel.choices);
    else 
        return coefficient;
}

export type Choice = {
    description: string;
    choices?: string[];
    min?: number;
    max?: number;
    // Lowest selectable index for a given recipe. Options below it are hidden in
    // the UI and the value is clamped up to it. Used for recipe-dependent limits
    // such as the minimum reflector tier a fusion recipe requires.
    minIndex?: (recipe:RecipeModel) => number;
}

function createEditableCopy(items: RecipeInOut[]): RecipeInOut[] {
    return items.map(item => ({ ...item }));
}

let CoilTierChoice:Choice = {
    description: "Coils",
    choices: CoilTierNames.map((name, index) => `T${index+1}: ${name}`),
}

type MachineList = {
    [key: string]: Machine;
}

export const machines: MachineList = {};

export const singleBlockMachine:Machine = {
    overclocker: StandardOverclocker.onlyNormal(),
    speed: 1,
    power: 1,
    parallels: 1,
    excludesRecipe: (recipe:Recipe) => {
        return (recipe.gtRecipe.MetadataByKey("compression_tier") ?? 0) > 0;
    }
};

const singleBlockMachineWith22Overclock:Machine = {
    overclocker: StandardOverclocker.onlyNormal(),
    speed: 1,
    power: (recipe, choices) => {
        return Math.pow(0.5, recipe.voltageTier);
    },
    parallels: 1,
};

const generatorParallels = (recipe:RecipeModel):number => {
    const recipeTier = recipe.recipe?.gtRecipe.voltageTier ?? recipe.voltageTier;
    return Math.pow(4, Math.max(0, recipe.voltageTier - recipeTier));
};

const tieredGeneratorMachine:Machine = {
    overclocker: NullOverclocker.instance,
    speed: 1,
    power: 1,
    parallels: generatorParallels,
    ignoreParallelLimit: true,
};

const GENERATOR_RECIPE_TYPES = new Set([
    "Combustion Generator",
    "Gas Turbine",
    "Steam Turbine",
]);

export function GetSingleBlockMachine(recipeType:RecipeType):Machine {
    if (recipeType.name == "Mass Fabrication")
        return singleBlockMachineWith22Overclock;
    if (GENERATOR_RECIPE_TYPES.has(recipeType.name))
        return tieredGeneratorMachine;
    return singleBlockMachine;
}

function IsRecipeType(recipe:RecipeModel, type:string):boolean {
    return recipe.recipe ? recipe.recipe.recipeType.name == type : false;
}

export const notImplementedMachine:Machine = {
    overclocker: StandardOverclocker.onlyNormal(),
    speed: 1,
    power: 1,
    parallels: 1,
    info: "Machine not implemented (Calculated as a singleblock)",
}

// ============================================================================
// Modifier-driven machine engine
// ----------------------------------------------------------------------------
// Machine behaviour is derived from the crafter's exported recipeModifiers
// rather than a hardcoded per-machine table. The formulas mirror
// GTRecipeModifiers from the GregTech CEu source. Crafters
// whose modifiers are not modelled fall back to a sensible default (non-perfect
// overclock, no parallels) and carry an informational note.
// ============================================================================

function makeParallelHatchChoice(tiers:ParallelHatchTier[]):Choice {
    return {
        description: "Parallel Hatch",
        choices: tiers.map((tier) => `${tier.name}: ${tier.parallels}`),
    };
}

// Number of parallels for the selected hatch (choice index into the tier list).
function parallelHatchCount(tiers:ParallelHatchTier[], index:number):number {
    const tier = tiers[index] ?? tiers[0];
    return Math.max(1, tier?.parallels ?? 1);
}

// --- Bulking (throughput multiplier with choice) ---
type BulkingType = { parallels: number; durationMultiplier: number };
const BULKING_TYPES: BulkingType[] = [
    { parallels: 4, durationMultiplier: 3.25 },
    { parallels: 8, durationMultiplier: 6.5 },
    { parallels: 16, durationMultiplier: 13 },
    { parallels: 32, durationMultiplier: 26 },
    { parallels: 64, durationMultiplier: 52 },
];

function makeBulkingChoice(): Choice {
    return {
        description: "Bulking",
        choices: BULKING_TYPES.map((type, i) => `Type ${i}: ${type.parallels}x / ${type.durationMultiplier}x`),
    };
}

function getBulkingMultipliers(index: number): BulkingType {
    return BULKING_TYPES[index] ?? BULKING_TYPES[2];
}

// Describes every machine choice key the user can set a global default for,
// together with the human-readable option labels (matching how each choice is
// rendered on individual recipes). Used by the "Default machine choices" editor.
export type ChoiceDescriptor = {
    key: string;
    description: string;
    options: string[];
};

export function getChoiceDefaultDescriptors():ChoiceDescriptor[] {
    return [
        { key: "coilTier", description: "Coils", options: CoilTierNames.map((name, index) => `T${index+1}: ${name}`) },
        { key: "parallels", description: "Parallel Hatch", options: ParallelHatchTiers.map((tier) => `${tier.name}: ${tier.parallels}`) },
        { key: "absoluteParallels", description: "Absolute Parallel Hatch", options: AbsoluteParallelHatchTiers.map((tier) => `${tier.name}: ${tier.parallels}`) },
        { key: "bulking", description: "Bulking", options: BULKING_TYPES.map((type, i) => `Type ${i}: ${type.parallels}x / ${type.durationMultiplier}x`) },
        { key: "rotorHolder", description: "Rotor Holder", options: RotorHolderTiers.map((holder) => holder.name) },
        { key: "turbineRotor", description: "Rotor", options: TurbineRotors.map((rotor) => `${rotor.name} (P:${rotor.power}%, E:${rotor.efficiency}%)`) },
        { key: "boosting", description: "Turbine Boosting", options: ["None", "Passive", "Active"] },
        { key: "combustionBoosting", description: "Combustion Boosting", options: ["None", "Boosting"] },
        { key: "cooling", description: "Combustion Frame Cooling", options: CombustionFrameCooling.map((c) => c.label) },
    ];
}

function makeCoilChoice():Choice {
    return {
        description: "Coils",
        choices: CoilTierNames.map((name, index) => `T${index+1}: ${name}`),
    };
}

// Fusion reactors run at a fixed voltage matching their tier (e.g. luv/zpm/uv/
// uhv/uev/uiv_fusion_reactor). Derives that tier from the crafter's internal
// name prefix by matching it against the voltage tier names.
function getReactorVoltageTier(crafter:Item):number | undefined {
    const prefix = (crafter.internalName ?? "").split("_")[0].toUpperCase();
    const index = voltageTier.findIndex((tier) => tier.name.toUpperCase() === prefix);
    return index >= 0 ? index : undefined;
}

function multiplyFactors(factors: MachineCoefficient<number>[]): MachineCoefficient<number> {
    if (factors.length === 0)
        return 1;
    if (factors.length === 1)
        return factors[0];
    const closures = factors;
    return (recipe, _choices) => closures.reduce<number>((product, factor) => product * GetParameter<number>(factor, recipe), 1);
}

// EBF heat helpers, now reading the real coil baseHeatCapacity from the data.
function getEbfBlastTemp(recipe:RecipeModel, choices:{[key:string]:number}):number {
    const coil = CoilTiers[choices.coilTier] ?? CoilTiers[0];
    const coilHeat = coil ? coil.baseHeatCapacity : 0;
    const voltageHeat = Math.max(0, recipe.voltageTier - TIER_MV) * 100;
    return coilHeat + voltageHeat;
}

function getEbfExcessHeat(recipe:RecipeModel, choices:{[key:string]:number}):number {
    const recipeHeat = recipe.recipe?.gtRecipe.MetadataByKey("ebf_temp") ?? 0;
    return getEbfBlastTemp(recipe, choices) - recipeHeat;
}

// Lowest coil choice index whose blast temperature reaches the recipe's required
// heat (coil base heat + the recipe's voltage heat). Coils below it can't run the
// recipe and are hidden from the dropdown.
function minCoilIndexForEbf(recipe:RecipeModel):number {
    const recipeHeat = recipe.recipe?.gtRecipe.MetadataByKey("ebf_temp") ?? 0;
    if (recipeHeat <= 0)
        return 0;
    const voltageHeat = Math.max(0, recipe.voltageTier - TIER_MV) * 100;
    const index = CoilTiers.findIndex((coil) => coil.baseHeatCapacity + voltageHeat >= recipeHeat);
    return index < 0 ? Math.max(0, CoilTiers.length - 1) : index;
}

function makeEbfOverclocker(recipe:RecipeModel, choices:{[key:string]:number}):Overclocker {
    const maxPerfectOverclocks = Math.floor(getEbfExcessHeat(recipe, choices) / 1800);
    return StandardOverclocker.perfectThenNormal(maxPerfectOverclocks);
}

function ebfPower(recipe:RecipeModel, choices:{[key:string]:number}):number {
    const energyReductions = Math.floor(getEbfExcessHeat(recipe, choices) / 900);
    const gtRecipe = recipe.recipe?.gtRecipe;
    const baseEuPerTick = Math.abs((gtRecipe?.voltage ?? 0) * (gtRecipe?.amperage ?? 1));
    if (baseEuPerTick === 0)
        return 1;
    const discountedEuPerTick = Math.floor(baseEuPerTick * Math.pow(0.95, energyReductions));
    return discountedEuPerTick / baseEuPerTick;
}

// Mutable accumulator describing the machine being assembled from modifiers.
type MachineBuilder = {
    speedFactors: MachineCoefficient<number>[];
    durationModifiers: MachineCoefficient<number>[];
    powerFactors: MachineCoefficient<number>[];
    parallelFactors: MachineCoefficient<number>[];
    overclocker?: MachineCoefficient<Overclocker>;
    subtick: boolean;
    truncateFinalEuPerTick: boolean;
    ignoreParallelLimit: boolean;
    choices: {[key:string]:Choice};
    enforceChoiceConstraints?: (recipe:RecipeModel, choices:{[key:string]:number}) => void;
    excludesRecipe?: (recipe:Recipe) => boolean;
    fixedVoltageTier?: MachineCoefficient<number>;
    overclockBaseVoltage?: MachineCoefficient<number>;
    infos: string[];
    parallelLimitPowerFactors?: MachineCoefficient<number>[];
};

type ModifierImpl = (builder:MachineBuilder, crafter:Item) => void;

const NO_OP:ModifierImpl = () => {};

function addCoilChoice(builder:MachineBuilder) {
    builder.choices["coilTier"] = makeCoilChoice();
}
function addParallelChoice(builder:MachineBuilder) {
    builder.choices["parallels"] = makeParallelHatchChoice(ParallelHatchTiers);
    builder.parallelFactors.push((_recipe, choices) => parallelHatchCount(ParallelHatchTiers, choices.parallels));
}

function addBulkingChoice(builder:MachineBuilder) {
    builder.choices["bulking"] = makeBulkingChoice();
    builder.parallelFactors.push((_recipe, choices) => getBulkingMultipliers(choices.bulking).parallels);
    builder.durationModifiers.push((_recipe, choices) => getBulkingMultipliers(choices.bulking).durationMultiplier);
    // Bulking multiplies recipe contents without multiplying EU/t.
    builder.powerFactors.push((_recipe, choices) => 1 / getBulkingMultipliers(choices.bulking).parallels);
}

// Like addParallelChoice, but the parallels do not increase the EU consumed:
// each parallel runs for free, so the per-recipe power is divided by the count.
function addFreeParallelChoice(builder:MachineBuilder) {
    builder.choices["absoluteParallels"] = makeParallelHatchChoice(AbsoluteParallelHatchTiers);
    builder.parallelFactors.push((_recipe, choices) => parallelHatchCount(AbsoluteParallelHatchTiers, choices.absoluteParallels));
    builder.powerFactors.push((_recipe, choices) => 1 / parallelHatchCount(AbsoluteParallelHatchTiers, choices.absoluteParallels));
}

// Crafters whose recipe-modifier lambda is not modelled by id but whose behaviour
// is known. Keyed by `mod:internalName` (the lambda id is shared and unstable
// across exports, so it cannot be used as a stable key).
const crafterModifierRegistry: {[id:string]: ModifierImpl} = {
};

// Maps each known modifier id to the contribution it makes to a machine.
const modifierRegistry: {[id:string]: ModifierImpl} = {
    // --- Overclocking behaviour ---
    "oc_perfect": builder => { builder.overclocker = StandardOverclocker.onlyPerfect(); },
    "oc_non_perfect": builder => { builder.overclocker = StandardOverclocker.onlyNormal(); },
    "oc_perfect_subtick": builder => {
        builder.overclocker = StandardOverclocker.onlyPerfect();
        builder.subtick = true;
    },
    "oc_non_perfect_subtick": builder => {
        builder.overclocker = StandardOverclocker.onlyNormal();
        builder.subtick = true;
    },
    "subtick": builder => { builder.subtick = true; },

    // --- Parallels ---
    // parallel_hatch scales EU with the parallel count (voltage-budget limited),
    // while absolute_parallel runs its parallels for free (no extra EU).
    "parallel_hatch": addParallelChoice,
    "absolute_parallel": addFreeParallelChoice,

    // --- Bulk / throughput multipliers ---
    "throughput_boosting": builder => {
        builder.parallelFactors.push(4);
        builder.durationModifiers.push(1.6);
        builder.powerFactors.push(0.95);
        // The 4 parallels are free: divide the per-recipe power so total EU does
        // not grow with the parallel count.
        builder.powerFactors.push(1 / 4);
        builder.truncateFinalEuPerTick = true;
    },
    "bulking": addBulkingChoice,

    // --- Coil-based specialised overclocks ---
    "ebf_oc": builder => {
        builder.overclocker = makeEbfOverclocker;
        builder.powerFactors.push(ebfPower);
        addCoilChoice(builder);
        // Hide coils that can't reach the recipe's required blast temperature.
        builder.choices["coilTier"].minIndex = minCoilIndexForEbf;
    },
    "cracker_oc": builder => {
        builder.overclocker = StandardOverclocker.onlyNormal();
        addCoilChoice(builder);
        builder.powerFactors.push((_recipe, choices) => {
            const tier = choices.coilTier;
            if (tier <= 0)
                return 1;
            const discount = tier > 9 ? (0.9 + (tier - 9) * 0.025) : tier * 0.1;
            return Math.max(0.0001, 1 - discount);
        });
    },
    "pyrolyse_oven_oc": builder => {
        builder.overclocker = StandardOverclocker.onlyNormal();
        addCoilChoice(builder);
        const durationModifier = (_recipe:RecipeModel, choices:{[key:string]:number}) => {
            const tier = choices.coilTier;
            return tier == 0 ? (4 / 3) : (2 / (tier + 1));
        };
        builder.durationModifiers.push(durationModifier);
    },
    "chemical_reactor_oc": builder => {
        builder.overclocker = StandardOverclocker.onlyNormal();
        addCoilChoice(builder);
        builder.durationModifiers.push((_recipe, choices) => 1 / (0.75 + choices.coilTier * 0.25));
        builder.parallelLimitPowerFactors = [...builder.powerFactors];
        builder.powerFactors.push((_recipe, choices) => 1 - choices.coilTier * 0.05);
    },
    "multi_smellter_parallel": builder => {
        builder.overclocker = StandardOverclocker.onlyNormal();
        addCoilChoice(builder);
        const maxParallels = (_recipe:RecipeModel, choices:{[key:string]:number}) => {
            const coil = CoilTiers[choices.coilTier] ?? CoilTiers[0];
            const level = coil ? coil.smelterLevel : (choices.coilTier + 1);
            return Math.max(1, 32 * level);
        };
        builder.parallelFactors.push(maxParallels);
        // At full parallel capacity the game rewrites the recipe to 256 ticks
        // before overclocking, regardless of the original recipe duration.
        builder.speedFactors.push((recipe, choices) => {
            const duration = recipe.recipe?.gtRecipe.durationTicks ?? 256;
            return duration / 256;
        });
        // The rewritten base EU/t is floor(maxParallel / (2 * coilDiscount)).
        // Parallel contents are then applied without multiplying that EU/t.
        const baseEuPerTick = (recipe:RecipeModel, choices:{[key:string]:number}) => {
            const coil = CoilTiers[choices.coilTier] ?? CoilTiers[0];
            const discount = Math.max(1, coil?.energyDiscount ?? 1);
            return Math.max(1, Math.floor(maxParallels(recipe, choices) / (2 * discount)));
        };
        builder.overclockBaseVoltage = baseEuPerTick;
        builder.powerFactors.push((recipe, choices) => {
            const recipeEuPerTick = Math.abs(recipe.recipe?.gtRecipe.voltage ?? 0);
            if (recipeEuPerTick <= 0)
                return 1;
            return baseEuPerTick(recipe, choices) / (recipeEuPerTick * maxParallels(recipe, choices));
        });
    },

    // --- No-ops for rate calculation ---
    "batch_mode": NO_OP,
    "default_environment_requirement": NO_OP,
    "consume_eu_to_start": NO_OP,
    "fake_fusion_overclock": NO_OP,
};

const machineCache: {[id:string]: Machine} = {};

function ComposeMachineFromModifiers(crafter:Item, _recipeType:RecipeType):Machine {
    const modifiers = crafter.recipeModifiers ?? [];
    if (modifiers.length === 0)
        return notImplementedMachine;

    const builder:MachineBuilder = {
        speedFactors: [],
        durationModifiers: [],
        powerFactors: [],
        parallelFactors: [],
        overclocker: undefined,
        subtick: false,
        truncateFinalEuPerTick: false,
        ignoreParallelLimit: false,
        choices: {},
        infos: [],
    };

    let hasCustomLogic = false;
    for (const id of modifiers) {
        const impl = modifierRegistry[id];
        if (impl)
            impl(builder, crafter);
        else
            // Unknown / lambda / fusion-style modifier: cannot be modelled exactly.
            hasCustomLogic = true;
    }

    // Crafters with a known-but-lambda modifier (keyed by id rather than the
    // unstable lambda modifier id). Applying it replaces the unmodelled lambda,
    // so the generic approximation note is suppressed.
    const crafterImpl = crafterModifierRegistry[`${crafter.mod}:${crafter.internalName}`];
    if (crafterImpl) {
        crafterImpl(builder, crafter);
        hasCustomLogic = false;
    }

    if (hasCustomLogic)
        builder.infos.push("Uses custom machine logic that is not fully modelled (approximated).");

    const machine:Machine = {
        overclocker: builder.overclocker ?? StandardOverclocker.onlyNormal(),
        speed: multiplyFactors(builder.speedFactors),
        power: multiplyFactors(builder.powerFactors),
        parallels: multiplyFactors(builder.parallelFactors),
    };
    if (builder.parallelLimitPowerFactors)
        machine.parallelLimitPower = multiplyFactors(builder.parallelLimitPowerFactors);
    if (builder.durationModifiers.length > 0)
        machine.durationModifiers = builder.durationModifiers;
    if (builder.subtick)
        machine.subtick = true;
    if (builder.truncateFinalEuPerTick)
        machine.truncateFinalEuPerTick = true;
    if (Object.keys(builder.choices).length > 0)
        machine.choices = builder.choices;
    if (builder.enforceChoiceConstraints)
        machine.enforceChoiceConstraints = builder.enforceChoiceConstraints;
    if (builder.excludesRecipe)
        machine.excludesRecipe = builder.excludesRecipe;
    if (builder.fixedVoltageTier !== undefined)
        machine.fixedVoltageTier = builder.fixedVoltageTier;
    if (builder.overclockBaseVoltage !== undefined)
        machine.overclockBaseVoltage = builder.overclockBaseVoltage;
    if (builder.ignoreParallelLimit)
        machine.ignoreParallelLimit = true;
    if (builder.infos.length > 0)
        machine.info = builder.infos.join(" ");
    return machine;
}

// ============================================================================
// Rotor-based turbine generators
// ----------------------------------------------------------------------------
// The large gas/plasma turbines (and the boosted Supreme/Nyinsane variants)
// cannot be modelled through the named-modifier pattern: their behaviour is
// driven by the installed rotor holder tier and turbine rotor material, exposed
// here as data-driven choices (mirroring the EBF coil choice).
//
// GT formulas (RotorHolderPartMachine / LargeTurbineMachine):
//   tierDiff        = holderTier - controllerTier   (clamped >= 0)
//   totalEfficiency = max(100, rotorEfficiency% * (1 + 0.1 * tierDiff))
//   totalPower      = rotorPower% * 2^tierDiff
//   maxVoltage      = baseProduction * totalPower/100 * parallelBonus
// Each rotor holder tier above the controller adds a flat +10% efficiency: the
// holder bonuses are summed and then multiplied onto the rotor efficiency, e.g.
// a 160% rotor two tiers up is 160% * (1 + 0.2) = 192%, a 320% rotor four tiers
// up is 320% * (1 + 0.4) = 448%.
//
// A turbine's EU/t output is maxVoltage (times the boost bonus, if any) and is
// INDEPENDENT of rotor efficiency. maxVoltage/recipeVoltage, rounded UP, is how
// many fuel recipes one turbine runs in parallel: the turbine consumes fuel for
// all of them but still only outputs the unrounded maxVoltage worth of EU/t (the
// fractional last parallel's fuel makes no extra power), so the power modifier
// scales the per-recipe output down by maxVoltage/(parallels*recipeVoltage).
// Rotor efficiency is fuel economy: it stretches the recipe DURATION by
// totalEfficiency (the game truncates that to a whole tick), making the same fuel
// - and the de-energized output (e.g. plasma -> gas) - burn slower at an
// unchanged EU/t. This is modelled as a speed factor of 100/totalEfficiency so
// the solver's own duration truncation reproduces the exact in-game fuel rate,
// rather than scaling the recipe amounts.
// ============================================================================

type TurbineSpec = {
    controllerTier: number;     // tier the rotor holder is compared against
    baseProduction: number;     // BASE_EU_OUTPUT = V[controllerTier] * 2
    parallelBonus: number;      // turbine count multiplier (more parallel recipes)
    boostTable?: number[];      // EU/t output multiplier by [None, Passive, Active]
};

function makeTurbineMachine(spec:TurbineSpec):Machine {
    // Rotor holders below the turbine's controller tier cannot be installed.
    const minHolderIndex = Math.max(0, RotorHolderTiers.findIndex(h => h.tier >= spec.controllerTier));
    const choices:{[key:string]:Choice} = {
        rotorHolder: { description: "Rotor Holder", choices: RotorHolderTiers.map(h => h.name), min: minHolderIndex },
        turbineRotor: { description: "Rotor", choices: TurbineRotors.map(r => `${r.name} (P:${r.power}%, E:${r.efficiency}%)`) },
    };
    if (spec.boostTable)
        choices.boosting = { description: "Turbine Boosting", choices: ["None", "Passive", "Active"] };

    const tierDiffOf = (selected:{[key:string]:number}) => {
        const holder = RotorHolderTiers[selected.rotorHolder] ?? RotorHolderTiers[0];
        return Math.max(0, (holder?.tier ?? spec.controllerTier) - spec.controllerTier);
    };
    const rotorOf = (selected:{[key:string]:number}) => TurbineRotors[selected.turbineRotor] ?? TurbineRotors[0];
    const totalEfficiencyOf = (selected:{[key:string]:number}) => {
        const rotor = rotorOf(selected);
        // Each holder tier above the controller adds a flat +10% that is summed and
        // then multiplied onto the rotor efficiency (NOT compounded per tier).
        return Math.max(100, (rotor?.efficiency ?? 100) * (1 + 0.1 * tierDiffOf(selected)));
    };

    // maxVoltage is the turbine's rated EU/t output (before the boost bonus).
    const maxVoltageOf = (selected:{[key:string]:number}) => {
        const totalPower = (rotorOf(selected)?.power ?? 100) * Math.pow(2, tierDiffOf(selected));
        return spec.baseProduction * totalPower / 100 * spec.parallelBonus;
    };

    // Rotor efficiency does NOT raise the EU/t output (it lowers fuel use via the
    // speed modifier below); only the boost bonus (lubricant / coolant on the
    // Supreme/Nyinsane variants) multiplies the output. The turbine burns fuel for
    // the full (rounded-up) parallel count but only outputs the unrounded
    // maxVoltage, so scale the per-recipe output down by the fractional last
    // parallel: maxVoltage/(parallels*recipeVoltage). This caps EU/t at maxVoltage
    // without changing the fuel, which stays tied to the ceil'd parallel count.
    const power:MachineCoefficient<number> = (recipe, selected) => {
        const boost = spec.boostTable ? (spec.boostTable[selected.boosting ?? 0] ?? spec.boostTable[0]) : 1;
        const recipeVoltage = Math.abs(recipe.recipe?.gtRecipe.voltage ?? 0);
        if (recipeVoltage <= 0)
            return boost;
        const maxVoltage = maxVoltageOf(selected);
        const parallels = Math.max(1, Math.ceil(maxVoltage / recipeVoltage));
        return boost * maxVoltage / (parallels * recipeVoltage);
    };

    // Rotor efficiency is fuel economy: a higher efficiency makes the same fuel
    // burn slower, i.e. it stretches the recipe duration. Modelling it as a speed
    // factor of 100/totalEfficiency lengthens the recipe (the solver truncates the
    // stretched duration to a whole tick, exactly as the game does), which lowers
    // the fuel throughput - and the de-energized output (e.g. plasma -> gas) with
    // it - while leaving the EU/t output (voltage) untouched.
    const speed:MachineCoefficient<number> = (_recipe, selected) => 100 / totalEfficiencyOf(selected);

    const parallels:MachineCoefficient<number> = (recipe, selected) => {
        const recipeVoltage = Math.abs(recipe.recipe?.gtRecipe.voltage ?? 0);
        if (recipeVoltage <= 0)
            return 1;
        return Math.max(1, Math.ceil(maxVoltageOf(selected) / recipeVoltage));
    };

    const info = spec.boostTable
        ? "EU/t output scales with the rotor holder tier, rotor power and boost; rotor efficiency instead lowers fuel use (fuel burns slower at the same EU/t). Boosting fluid is not modelled."
        : "EU/t output scales with the rotor holder tier and rotor power; rotor efficiency instead lowers fuel use (fuel burns slower at the same EU/t).";

    return {
        choices,
        overclocker: NullOverclocker.instance,
        speed,
        power,
        parallels,
        ignoreParallelLimit: true,
        info,
    };
}

// ============================================================================
// Combustion generators (engines and modules)
// ----------------------------------------------------------------------------
// The large/extreme combustion engines and the modular combustion/rocket
// modules behave like the turbine generators but burn fuel instead of spinning
// rotors. Each advertises a base EU/t output and an optional boost: supplying a
// secondary fluid raises the output (and burns fuel proportionally faster).
// The "module" variants live inside a Modular Combustion Frame, which feeds them
// coolant for an additional EU/t multiplier.
//
// As with the turbines, the solver's energy is independent of the parallel
// count, so `power` carries the EU-per-fuel multiplier while `parallels` only
// controls how much fuel a single generator burns (i.e. how many are needed).
//   maxVoltage = baseProduction * (boosting ? 2 : 1)     // 2x fuel consumption
//   energyModifier (EU per fuel) = (boosting ? boostMultiplier/2 : 1) * cooling
// e.g. the LCE produces 2048 EU/t base and "up to 6144 EU/t at 2x fuel": that is
// 64 parallels * 1.0 power, boosted to 64*2=128 parallels * 1.5 power = 6144.
// ============================================================================

// Frame coolant options, shared by every module variant. Index 0 (no coolant)
// is the default and applies the frame's -10% penalty.
const CombustionFrameCooling:{label:string, factor:number}[] = [
    { label: "None (-10%)", factor: 0.9 },
    { label: "Distilled Water (+20%)", factor: 1.2 },
    { label: "De-Ionized Water (+40%)", factor: 1.4 },
];

type CombustionSpec = {
    voltageTier: number;        // tier the generator runs at (fixed in the UI)
    baseProduction: number;     // base EU/t output
    boostMultiplier: number;    // boosted EU/t = baseProduction * boostMultiplier
    boostFluid: string;         // fluid supplied to boost output
    modular?: boolean;          // module variants sit in a Modular Combustion Frame
};

function makeCombustionMachine(spec:CombustionSpec):Machine {
    const choices:{[key:string]:Choice} = {
        combustionBoosting: { description: "Boosting", choices: ["None", spec.boostFluid] },
    };
    if (spec.modular)
        choices.cooling = { description: "Frame Cooling", choices: CombustionFrameCooling.map(c => c.label) };

    const isBoosting = (selected:{[key:string]:number}) => (selected.combustionBoosting ?? 0) > 0;

    const power:MachineCoefficient<number> = (_recipe, selected) => {
        let modifier = isBoosting(selected) ? spec.boostMultiplier / 2 : 1;
        if (spec.modular)
            modifier *= (CombustionFrameCooling[selected.cooling ?? 0] ?? CombustionFrameCooling[0]).factor;
        return modifier;
    };

    const parallels:MachineCoefficient<number> = (recipe, selected) => {
        const maxVoltage = spec.baseProduction * (isBoosting(selected) ? 2 : 1);
        const recipeVoltage = Math.abs(recipe.recipe?.gtRecipe.voltage ?? 0);
        if (recipeVoltage <= 0)
            return 1;
        return Math.max(1, Math.ceil(maxVoltage / recipeVoltage));
    };

    const info = spec.modular
        ? "Boosting raises output at the cost of extra fuel; the boosting fluid is not modelled. Frame cooling adds a flat EU/t multiplier."
        : "Boosting raises output at the cost of extra fuel; the boosting fluid is not modelled.";

    return {
        choices,
        overclocker: NullOverclocker.instance,
        speed: 1,
        power,
        parallels,
        fixedVoltageTier: spec.voltageTier,
        ignoreParallelLimit: true,
        info,
    };
}

// Crafters whose machine cannot be derived from modifiers. Keyed by the binary
// item id (i:<mod>:<internalName>:<damage>).
const customMachineRegistry:{[crafterId:string]: (crafter:Item) => Machine} = {
    "i:gtceu:steam_large_turbine:0": () => makeTurbineMachine({ controllerTier: 3, baseProduction: 1024, parallelBonus: 1 }),
    "i:gtceu:gas_large_turbine:0": () => makeTurbineMachine({ controllerTier: 4, baseProduction: 4096, parallelBonus: 1 }),
    "i:gtceu:plasma_large_turbine:0": () => makeTurbineMachine({ controllerTier: 5, baseProduction: 16384, parallelBonus: 1 }),
    "i:gtceu:large_combustion_engine:0": () => makeCombustionMachine({ voltageTier: TIER_EV, baseProduction: 2048, boostMultiplier: 3, boostFluid: "Oxygen Gas" }),
    "i:gtceu:extreme_combustion_engine:0": () => makeCombustionMachine({ voltageTier: TIER_IV, baseProduction: 8192, boostMultiplier: 4, boostFluid: "Liquid Oxygen" }),
};

// Builds (and memoizes) the Machine for a given multiblock crafter from its
// exported recipeModifiers. Replaces the former hardcoded machine table.
export function BuildMachineFromCrafter(crafter:Item, recipeType:RecipeType):Machine {
    const cached = machineCache[crafter.id];
    if (cached)
        return cached;
    const custom = customMachineRegistry[crafter.id];
    const machine = custom ? custom(crafter) : ComposeMachineFromModifiers(crafter, recipeType);
    machineCache[crafter.id] = machine;
    return machine;
}

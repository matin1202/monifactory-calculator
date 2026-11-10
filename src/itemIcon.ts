import { Repository, Goods, Item, Fluid, OreDict, RecipeObject } from "./repository.js";
import { NeiSelect, ShowNei, ShowNeiContext, ShowNeiMode } from "./nei.js";
import { ShowTooltip, HideTooltip, IsHovered } from "./tooltip.js";
import { IsTouchUI } from "./utils.js";

// Global cycling state
let globalIndex = 0;
let oredictElements: IconBox[] = [];

// Global actions map
const touch = IsTouchUI();
export const actions: { [key: string]: string } = touch ? {
    "item_icon_click": "Tap / long-press to add recipe",
    "select": "Tap to select",
    "toggle_link_ignore": "Tap to toggle link ignore",
    "crafter_click": "Tap to select another crafter"
} : {
    "item_icon_click": "Left/Right click to add recipe",
    "select": "Click to select",
    "toggle_link_ignore": "Click to toggle link ignore",
    "crafter_click": "Click to select another crafter"
};

// Whether an icon is a result (output) of a recipe/group row in the recipe list.
export function IsRecipeOutputIcon(icon: Element): boolean {
    return icon.closest(".cell-out") !== null;
}

const defaultAction = touch
    ? "Tap: production, long-press: consumption"
    : "Left/Right click to view Production/Consumption for this item";

// Start global cycle once
window.setInterval(() => {
    globalIndex++;
    for (const element of oredictElements) {
        element.UpdateIconId();
    }
}, 500);

let highlightStyle: HTMLStyleElement = document.getElementById('item-icon-highlight-style') as HTMLStyleElement;

export class IconBox extends HTMLElement
{
    public obj:RecipeObject | null = null;

    constructor()
    {
        super();
        
        this.addEventListener("mouseenter", () => {
            const obj = this.GetDisplayObject();
            if (obj) {
                const actionType = this.getAttribute('data-action');
                // On touch screens, recipe list icons search on tap; their details
                // only open on a long press (see touch.ts).
                if (touch && actionType === "item_icon_click")
                    return;
                const actionText = actionType ? actions[actionType] : undefined;

                ShowTooltip(this, {
                    goods: obj,
                    action: actionText ?? defaultAction
                });
                
                this.UpdateHighlightStyle();
            }
        });
        
        this.addEventListener("mouseleave", () => {
            highlightStyle.textContent = '';
        });
        
        this.addEventListener('contextmenu', this.RightClick);
        this.addEventListener('click', this.LeftClick);
        this.UpdateIconId();
    }

    private StartOredictCycle(oredict: OreDict) {
        if (!oredict || oredict.items.length === 0) return;
        
        this.UpdateIconId();
        
        // Add to global cycle if not already there
        if (!oredictElements.includes(this)) {
            oredictElements.push(this);
        }
    }

    private StopOredictCycle() {
        const index = oredictElements.indexOf(this);
        if (index > -1) {
            oredictElements.splice(index, 1);
        }
    }

    private UpdateHighlightStyle() {
        const currentIconId = this.obj?.id;
        if (currentIconId && !this.classList.contains('item-icon-grid')) {
            highlightStyle.textContent = `
                item-icon[data-id="${currentIconId}"] {
                    box-shadow: 0 0 0 2px #4CAF50;
                    background-color: #4CAF5020;
                }
            `;
        }
    }

    UpdateIconId() {
        const obj = this.GetDisplayObject();
        if (obj) {
            const iconId = obj.iconId;
            const ix = iconId % 256;
            const iy = Math.floor(iconId / 256);
            this.style.setProperty('--pos-x', `${ix * -32}px`);
            this.style.setProperty('--pos-y', `${iy * -32}px`);
            
            // Update tooltip if this element is currently being hovered
            if (IsHovered(this)) {
                ShowTooltip(this, { goods: obj });
                this.UpdateHighlightStyle();
            }
        }
    }

    static get observedAttributes() {
        return ['data-id'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === 'data-id') {
            this.StopOredictCycle();
            this.obj = Repository.current.GetById<RecipeObject>(newValue);
            if (this.obj instanceof OreDict) {
                this.StartOredictCycle(this.obj);
            } else {
                this.UpdateIconId();
            }
        }
    }

    GetDisplayObject():Goods | null
    {
        if (this.obj instanceof Goods) {
            return this.obj;
        }

        if (this.obj instanceof OreDict) {
            return this.obj.items[globalIndex % this.obj.items.length];
        }

        return null;
    }

    disconnectedCallback()
    {
        this.StopOredictCycle();
        HideTooltip(this);
        if (IsHovered(this)) {
            highlightStyle.textContent = '';
        }
    }

    private CustomAction():string | null
    {
        return this.getAttribute('data-action');
    }

    RightClick(event:any)
    {
        if (this.CustomAction())
            return;
        if (event.ctrlKey || event.metaKey)
            return;
        event.preventDefault();
        ShowNei(this.obj, ShowNeiMode.Consumption, null);
    }

    LeftClick()
    {
        let action = this.CustomAction();
        if (action === "select")
            NeiSelect(this.GetDisplayObject() as Goods);
        if (action)
            return;
        ShowNei(this.obj, ShowNeiMode.Production, null);
    }
}

customElements.define("item-icon", IconBox);
console.log("Registered custom element: item-icon");
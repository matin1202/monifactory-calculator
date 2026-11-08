import { Goods, Repository, Item } from "./repository.js";
import { addProjectChangeListener } from "./page.js";

export class Dropdown {
    private static instance: Dropdown;
    private dropdown: HTMLElement;
    private currentTarget: HTMLElement | null = null;
    private currentPopulateCallback: ((container: HTMLElement) => void) | null = null;

    private constructor() {
        this.dropdown = document.getElementById("dropdown")!;
        
        // Hide dropdown when clicking anywhere
        document.addEventListener("click", (e) => {
            if (this.currentTarget) {
                // Ignore clicks on the target element that triggered the dropdown
                // or any of its children
                if (e.target === this.currentTarget || 
                    this.currentTarget.contains(e.target as Node) ||
                    this.dropdown.contains(e.target as Node)) {
                    return;
                }
                
                this.hide();
            }
        });

        // Register a single project change listener
        addProjectChangeListener(() => {
            if (this.isVisible() && this.currentPopulateCallback) {
                this.currentPopulateCallback(this.dropdown);
            }
        });
    }

    public static getInstance(): Dropdown {
        if (!Dropdown.instance) {
            Dropdown.instance = new Dropdown();
        }
        return Dropdown.instance;
    }

    public getDropdownElement(): HTMLElement {
        return this.dropdown;
    }

    public show(target: HTMLElement, populateCallback: (container: HTMLElement) => void): void {
        this.currentTarget = target;
        this.currentPopulateCallback = populateCallback;
        
        // Clear previous content
        this.dropdown.innerHTML = "";
        
        // Call the provided callback to populate the dropdown
        populateCallback(this.dropdown);
        
        this.dropdown.style.display = "block";
        
        // Position the dropdown
        // Needs reduced set here for some reason.
        this.dropdown.style.zIndex = "10000";
        const targetRect = target.getBoundingClientRect();
        const dropdownRect = this.dropdown.getBoundingClientRect();
        
        // Check if there's enough space below
        // Save some space for dynamic parts of the dropdown.
        const spaceBelow = window.innerHeight - targetRect.bottom - 50;
        
        const top = targetRect.bottom - Math.max(0, (dropdownRect.height - spaceBelow));
        const left = targetRect.right + Math.max(0, (targetRect.width - dropdownRect.width) / 2);
        // Keep the dropdown on screen (matters on narrow phone screens).
        const maxLeft = window.innerWidth - dropdownRect.width - 4;
        this.dropdown.style.top = `${Math.max(4, top)}px`;
        this.dropdown.style.left = `${Math.max(4, Math.min(left, maxLeft))}px`;
    }

    public hide(): void {
        this.currentTarget = null;
        this.currentPopulateCallback = null;
        this.dropdown.style.display = "none";
    }

    public isVisible(): boolean {
        return this.dropdown.style.display === "block";
    }
}

export function ShowDropdown(target: HTMLElement, populateCallback: (container: HTMLElement) => void): void {
    Dropdown.getInstance().show(target, populateCallback);
}

export function HideDropdown(): void {
    Dropdown.getInstance().hide();
}

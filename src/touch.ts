// Touch support: long-press on an item icon acts as a right click.
//
// Desktop users right-click item icons to see consumption recipes (or to add a
// consuming recipe). Touch screens have no right click, and only some mobile
// browsers turn a long press into a "contextmenu" event (iOS Safari never does).
// To behave the same everywhere we detect the long press ourselves, dispatch a
// synthetic "contextmenu" event, and swallow the browser's own one.

import { IconBox, IsRecipeOutputIcon } from "./itemIcon.js";
import { Dropdown } from "./dropdown.js";

const LONG_PRESS_MS = 600;
// Item icons in the recipe list: tap searches recipes, long press opens a menu.
const RECIPE_IO_ICON = 'item-icon[data-action="item_icon_click"]';
const MOVE_TOLERANCE_PX = 10;
const LONG_PRESS_TARGETS = "item-icon";

let pressTimer = 0;
let pressTarget: Element | null = null;
let startX = 0;
let startY = 0;
let lastTouchTime = 0;
let longPressFired = false;
let suppressClickUntil = 0;

function CancelPress() {
    if (pressTimer) {
        window.clearTimeout(pressTimer);
        pressTimer = 0;
    }
    pressTarget = null;
}

document.addEventListener("touchstart", (e: TouchEvent) => {
    lastTouchTime = Date.now();
    longPressFired = false;
    CancelPress();
    if (e.touches.length !== 1)
        return;
    const target = (e.target as Element | null)?.closest?.(LONG_PRESS_TARGETS);
    if (!target)
        return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    pressTarget = target;
    pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        const el = pressTarget;
        pressTarget = null;
        if (!el || !el.isConnected)
            return;
        longPressFired = true;
        navigator.vibrate?.(15);
        if (el.matches(RECIPE_IO_ICON) && el instanceof IconBox) {
            ShowRecipeIconMenu(el);
            return;
        }
        el.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY,
            button: 2,
        }));
    }, LONG_PRESS_MS);
}, { passive: true });

document.addEventListener("touchmove", (e: TouchEvent) => {
    if (!pressTarget)
        return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - startX) > MOVE_TOLERANCE_PX || Math.abs(touch.clientY - startY) > MOVE_TOLERANCE_PX)
        CancelPress();
}, { passive: true });

document.addEventListener("touchend", (e: TouchEvent) => {
    lastTouchTime = Date.now();
    CancelPress();
    if (longPressFired) {
        // Lifting the finger after a long press must not also count as a tap:
        // whatever opened under the finger (e.g. NEI) would receive the click.
        longPressFired = false;
        suppressClickUntil = Date.now() + 500;
        if (e.cancelable)
            e.preventDefault();
    }
});
document.addEventListener("touchcancel", () => { longPressFired = false; CancelPress(); }, { passive: true });

// The browser's own long-press contextmenu (Android) would duplicate ours.
document.addEventListener("contextmenu", (e: MouseEvent) => {
    if (!e.isTrusted)
        return;
    if (Date.now() - lastTouchTime > 1500)
        return;
    if ((e.target as Element | null)?.closest?.(LONG_PRESS_TARGETS)) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}, true);

// Backup for browsers that still synthesize a click after the long press.
document.addEventListener("click", (e: MouseEvent) => {
    if (Date.now() < suppressClickUntil) {
        suppressClickUntil = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}, true);

// Recipe list icons. The recipe list maps "click" to recipes making the item
// and "contextmenu" to recipes using it.
//   ingredient: tap = recipes making it
//   result:     tap = recipes using it
//   long press: menu with the item's name and both searches
function DispatchSearch(icon: Element, production: boolean) {
    icon.dispatchEvent(new MouseEvent(production ? "click" : "contextmenu", {
        bubbles: true,
        cancelable: true,
        button: production ? 0 : 2,
    }));
}

function EscapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

function ShowRecipeIconMenu(icon: IconBox) {
    const goods = icon.GetDisplayObject();
    if (!goods)
        return;
    const amount = icon.getAttribute("data-amount");
    const label = icon.closest("[data-label]")?.getAttribute("data-label");
    const dropdown = Dropdown.getInstance();
    dropdown.show(icon, container => {
        container.innerHTML = `
            <div class="icon-menu">
                <div class="icon-menu-name">${EscapeHtml(goods.name)}</div>
                <div class="icon-menu-mod">${EscapeHtml(goods.mod ?? "")}${amount && label ? ` · ${EscapeHtml(label)}: ${EscapeHtml(amount)}` : ""}</div>
                <button type="button" data-search="production">Recipes making it</button>
                <button type="button" data-search="consumption">Recipes using it</button>
            </div>`;
        container.querySelectorAll<HTMLButtonElement>("[data-search]").forEach(button => {
            button.addEventListener("click", () => {
                dropdown.hide();
                if (icon.isConnected)
                    DispatchSearch(icon, button.dataset.search === "production");
            });
        });
    });
}

document.addEventListener("click", (e: MouseEvent) => {
    // Our own re-dispatched events are untrusted; let them through.
    if (!e.isTrusted || Date.now() - lastTouchTime > 1000)
        return;
    const icon = (e.target as Element | null)?.closest?.(RECIPE_IO_ICON);
    if (!icon || !IsRecipeOutputIcon(icon))
        return;
    // A result's natural next step is what it is used for.
    e.preventDefault();
    e.stopImmediatePropagation();
    DispatchSearch(icon, false);
}, true);

export {};

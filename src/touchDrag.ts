// Touch support: long-press a recipe (or collapsed group) row, then drag it to
// reorder it. Desktop uses native HTML drag and drop (see recipeList.ts), which
// touch screens do not provide.
import { DragAndDrop } from "./page.js";
import { IsTouchUI } from "./utils.js";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;
const AUTO_SCROLL_EDGE_PX = 70;
const AUTO_SCROLL_MAX_SPEED = 14;
const ROW_SELECTOR = ".recipe-item, .recipe-group.collapsed";
const DROP_SELECTOR = ".recipe-item, .recipe-group, .group-buttons";
// Touches on these keep their own behaviour (icons have their own long press).
const INTERACTIVE_SELECTOR = "item-icon, button, input, select, textarea, a, label";

let pressTimer = 0;
let pressRow: HTMLElement | null = null;
let startX = 0;
let startY = 0;

let dragRow: HTMLElement | null = null;
let ghost: HTMLElement | null = null;
let grabOffsetY = 0;
let lastX = 0;
let lastY = 0;
let dropZone: HTMLElement | null = null;
let scroller: HTMLElement | null = null;
let scrollFrame = 0;

function CancelPress() {
    if (pressTimer) {
        window.clearTimeout(pressTimer);
        pressTimer = 0;
    }
    pressRow = null;
}

function FindScroller(element: HTMLElement): HTMLElement | null {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight)
            return node;
    }
    return document.scrollingElement as HTMLElement | null;
}

function SetDropZone(zone: HTMLElement | null) {
    if (zone === dropZone)
        return;
    dropZone?.classList.remove("drag-over");
    dropZone = zone;
    dropZone?.classList.add("drag-over");
}

function UpdateDrag() {
    if (!dragRow || !ghost)
        return;
    ghost.style.transform = `translateY(${lastY - grabOffsetY}px)`;
    // The ghost ignores pointer events, so this finds the row under the finger.
    const under = document.elementFromPoint(lastX, lastY) as HTMLElement | null;
    const zone = under?.closest<HTMLElement>(DROP_SELECTOR) ?? null;
    SetDropZone(zone && !dragRow.contains(zone) ? zone : null);
}

function AutoScroll() {
    scrollFrame = 0;
    if (!dragRow || !scroller)
        return;
    const rect = scroller === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
    let speed = 0;
    if (lastY < rect.top + AUTO_SCROLL_EDGE_PX)
        speed = -AUTO_SCROLL_MAX_SPEED * (1 - Math.max(0, lastY - rect.top) / AUTO_SCROLL_EDGE_PX);
    else if (lastY > rect.bottom - AUTO_SCROLL_EDGE_PX)
        speed = AUTO_SCROLL_MAX_SPEED * (1 - Math.max(0, rect.bottom - lastY) / AUTO_SCROLL_EDGE_PX);
    if (speed !== 0) {
        scroller.scrollTop += speed;
        UpdateDrag();
    }
    scrollFrame = window.requestAnimationFrame(AutoScroll);
}

function StartDrag(row: HTMLElement) {
    dragRow = row;
    navigator.vibrate?.(20);
    const rect = row.getBoundingClientRect();
    grabOffsetY = startY - rect.top;

    // A copy of the row inside a table so it keeps the row's styling.
    ghost = document.createElement("div");
    ghost.className = "touch-drag-ghost";
    ghost.style.left = `${rect.left}px`;
    ghost.style.width = `${rect.width}px`;
    const table = document.createElement("table");
    table.className = "recipe-table";
    const body = document.createElement("tbody");
    const copy = row.cloneNode(true) as HTMLElement;
    copy.classList.remove("dragging", "drag-over");
    copy.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
    body.appendChild(copy);
    table.appendChild(body);
    ghost.appendChild(table);
    document.body.appendChild(ghost);

    row.classList.add("dragging");
    document.body.classList.add("touch-dragging");
    scroller = FindScroller(row);
    lastX = startX;
    lastY = startY;
    UpdateDrag();
    scrollFrame = window.requestAnimationFrame(AutoScroll);
}

function EndDrag(drop: boolean) {
    if (scrollFrame)
        window.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    const row = dragRow;
    const zone = dropZone;
    SetDropZone(null);
    row?.classList.remove("dragging");
    ghost?.remove();
    ghost = null;
    dragRow = null;
    scroller = null;
    document.body.classList.remove("touch-dragging");
    if (!drop || !row || !zone)
        return;
    const draggedIid = parseInt(row.getAttribute("data-iid") || "0");
    const targetIid = parseInt(zone.getAttribute("data-iid") || "0");
    if (draggedIid && targetIid)
        DragAndDrop(draggedIid, targetIid);
}

if (IsTouchUI()) {
    document.addEventListener("touchstart", (e: TouchEvent) => {
        CancelPress();
        if (dragRow)
            EndDrag(false);
        if (e.touches.length !== 1)
            return;
        const target = e.target as Element | null;
        if (!target || target.closest(INTERACTIVE_SELECTOR))
            return;
        const row = target.closest<HTMLElement>(ROW_SELECTOR);
        if (!row || !row.closest("#recipe-list"))
            return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        pressRow = row;
        pressTimer = window.setTimeout(() => {
            pressTimer = 0;
            const pressed = pressRow;
            pressRow = null;
            if (pressed?.isConnected)
                StartDrag(pressed);
        }, LONG_PRESS_MS);
    }, { passive: true });

    // Not passive: once dragging, the finger must move the row, not scroll the page.
    document.addEventListener("touchmove", (e: TouchEvent) => {
        const touch = e.touches[0];
        if (pressRow) {
            if (Math.abs(touch.clientX - startX) > MOVE_TOLERANCE_PX || Math.abs(touch.clientY - startY) > MOVE_TOLERANCE_PX)
                CancelPress();
            return;
        }
        if (!dragRow)
            return;
        if (e.cancelable)
            e.preventDefault();
        lastX = touch.clientX;
        lastY = touch.clientY;
        UpdateDrag();
    }, { passive: false });

    document.addEventListener("touchend", (e: TouchEvent) => {
        CancelPress();
        if (!dragRow)
            return;
        // Lifting the finger must not also count as a tap on the row underneath.
        if (e.cancelable)
            e.preventDefault();
        EndDrag(true);
    });

    document.addEventListener("touchcancel", () => {
        CancelPress();
        if (dragRow)
            EndDrag(false);
    }, { passive: true });

    // Android fires a contextmenu on long press; it would interrupt the drag.
    document.addEventListener("contextmenu", (e: MouseEvent) => {
        if (dragRow || (e.target as Element | null)?.closest?.(ROW_SELECTOR) && !(e.target as Element).closest(INTERACTIVE_SELECTOR))
            e.preventDefault();
    });
}

export {};

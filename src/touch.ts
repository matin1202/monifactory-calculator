// Touch support: long-press on an item icon acts as a right click.
//
// Desktop users right-click item icons to see consumption recipes (or to add a
// consuming recipe). Touch screens have no right click, and only some mobile
// browsers turn a long press into a "contextmenu" event (iOS Safari never does).
// To behave the same everywhere we detect the long press ourselves, dispatch a
// synthetic "contextmenu" event, and swallow the browser's own one.

const LONG_PRESS_MS = 500;
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

export {};

import { Event } from "@clarity-types/data";
import { ScrollState } from "@clarity-types/interaction";
import config from "@src/core/config";
import { bind } from "@src/core/event";
import measure from "@src/core/measure";
import { schedule } from "@src/core/task";
import { time } from "@src/core/time";
import { clearTimeout, setTimeout } from "@src/core/timeout";
import { target, track } from "@src/data/target";
import * as boxmodel from "@src/layout/boxmodel";
import { iframe } from "@src/layout/dom";
import encode from "./encode";

export let state: ScrollState[] = [];
let timeout: number = null;

export function start(): void {
    state = [];
    recompute();
}

export function observe(root: Node): void {
    let frame = iframe(root);
    let node = frame ? frame.contentWindow : (root === document ? window : root);
    bind(node, "scroll", recompute, true);
}

function recompute(event: UIEvent = null): void {
    let w = window as Window;
    let de = document.documentElement;
    let element = event ? target(event) : de;

    // If the target is a Document node, then identify corresponding documentElement and window for this document
    if (element && element.nodeType === Node.DOCUMENT_NODE) {
        let frame = iframe(element);
        w = frame ? frame.contentWindow : w;
        element = de = (element as Document).documentElement;
    }

    // Edge doesn't support scrollTop position on document.documentElement.
    // For cross browser compatibility, looking up pageYOffset on window if the scroll is on document.
    // And, if for some reason that is not available, fall back to looking up scrollTop on document.documentElement.
    let x = element === de && "pageXOffset" in w ? Math.round(w.pageXOffset) : Math.round((element as HTMLElement).scrollLeft);
    let y = element === de && "pageYOffset" in w ? Math.round(w.pageYOffset) : Math.round((element as HTMLElement).scrollTop);
    let current: ScrollState = { time: time(), event: Event.Scroll, data: {target: track(element), x, y} };

    // We don't send any scroll events if this is the first event and the current position is top (0,0)
    if (event === null && x === 0 && y === 0) { return; }

    let length = state.length;
    let last = length > 1 ? state[length - 2] : null;
    if (last && similar(last, current)) { state.pop(); }
    state.push(current);

    clearTimeout(timeout);
    timeout = setTimeout(process, config.lookahead, Event.Scroll);
}

export function reset(): void {
    state = [];
}

function process(event: Event): void {
    schedule(encode.bind(this, event));
    measure(boxmodel.compute)();
}

function similar(last: ScrollState, current: ScrollState): boolean {
    let dx = last.data.x - current.data.x;
    let dy = last.data.y - current.data.y;
    return (dx * dx + dy * dy < config.distance * config.distance) && (current.time - last.time < config.interval);
}

export function end(): void {
    clearTimeout(timeout);
    state = [];
}

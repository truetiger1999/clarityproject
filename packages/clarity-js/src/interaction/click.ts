import { Event } from "@clarity-types/data";
import { ClickData } from "@clarity-types/interaction";
import { bind } from "@src/core/event";
import { schedule } from "@src/core/task";
import { link, target, track } from "@src/data/target";
import { iframe } from "@src/layout/dom";
import offset from "@src/layout/offset";
import encode from "./encode";

export let data: ClickData;

export function start(): void {
    reset();
}

export function observe(root: Node): void {
    bind(root, "click", handler.bind(this, Event.Click, root), true);
}

function handler(event: Event, root: Node, evt: MouseEvent): void {
    let frame = iframe(root);
    let d = frame ? frame.contentDocument.documentElement : document.documentElement;
    let x = "pageX" in evt ? Math.round(evt.pageX) : ("clientX" in evt ? Math.round(evt["clientX"] + d.scrollLeft) : null);
    let y = "pageY" in evt ? Math.round(evt.pageY) : ("clientY" in evt ? Math.round(evt["clientY"] + d.scrollTop) : null);
    // In case of iframe, we adjust (x,y) to be relative to top parent's origin
    if (frame) {
        let distance = offset(frame);
        x = x ? x + distance.x : x;
        y = y ? y + distance.y : y;
    }

    let t = target(evt);
    // Find nearest anchor tag (<a/>) parent if current target node is part of one
    // If present, we use the returned link element to populate text and link properties below
    let a = link(t);

    // Check for null values before processing this event
    if (x !== null && y !== null) {
        data = {
            target: track(t),
            x,
            y,
            button: evt.button,
            text: a ? a.textContent : null,
            link: a ? a.href : null
        };
        schedule(encode.bind(this, event));
    }
}

export function reset(): void {
    data = null;
}

export function end(): void {
    reset();
}

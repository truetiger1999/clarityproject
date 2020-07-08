import { Event } from "@clarity-types/data";
import { PaintState } from "@clarity-types/performance";
import { time } from "@src/core/time";
import encode from "./encode";

// Reference: https://www.w3.org/TR/paint-timing/
export let state: PaintState = null;

export function reset(): void {
    state = null;
}

export function compute(entry: PerformanceEntry): void {
    state = { time: time(entry.startTime), data: { name: entry.name } };
    encode(Event.Paint);
}

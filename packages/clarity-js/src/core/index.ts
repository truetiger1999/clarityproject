import * as event from "@src/core/event";
import * as task from "@src/core/task";
import * as time from "@src/core/time";

export function start(): void {
    time.start();
    task.reset();
    event.reset();
}

export function end(): void {
    event.reset();
    task.reset();
    time.end();
}

export function check(): boolean {
    try {
        return typeof Promise !== "undefined" &&
            window["MutationObserver"] &&
            document["createTreeWalker"] &&
            "now" in Date &&
            "now" in performance &&
            typeof WeakMap !== "undefined";
    } catch (ex) {
        return false;
    }
}

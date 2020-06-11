import { Code, Dimension, Metric, Severity } from "@clarity-types/data";
import { bind } from "@src/core/event";
import measure from "@src/core/measure";
import { setTimeout } from "@src/core/timeout";
import * as dimension from "@src/data/dimension";
import * as metric from "@src/data/metric";
import * as log from "@src/diagnostic/log";
import * as navigation from "@src/performance/navigation";

let observer: PerformanceObserver;
let polling: boolean;
let lastEntryIndex: number = 0;

export function start(): void {
    // Check the browser support performance object as a pre-requisite for any performance measurement
    if (performance && "getEntries" in performance) {
        // Start monitoring performance data after page has finished loading.
        // If the document.readyState is not yet complete, we intentionally call observe using a setTimeout.
        // This allows us to capture loadEventEnd on navigation timeline.
        if (document.readyState !== "complete") {
            bind(window, "load", setTimeout.bind(this, observe, 0));
        } else { observe(); }
    }
}

export function compute(): void {
    if (polling) { process(performance.getEntries(), lastEntryIndex); }
}

function observe(): void {
    lastEntryIndex = 0;
    process(performance.getEntries(), 0);
    // For browsers that support observers, we let browser push new entries to us as and when they happen.
    // In all other cases we manually look out for new entries and process them as we discover them.
    if (window["PerformanceObserver"]) {
        if (observer) { observer.disconnect(); }
        observer = new PerformanceObserver(measure(handle) as PerformanceObserverCallback);
        observer.observe({ entryTypes: ["navigation", "resource", "longtask", "first-input", "layout-shift", "largest-contentful-paint"] });
    } else { polling = true; }
}

function handle(entries: PerformanceObserverEntryList): void {
    process(entries.getEntries(), 0);
}

function process(entries: PerformanceEntryList, offset: number): void {
    if (entries && entries.length > offset) {
        let visible = "visibilityState" in document ? document.visibilityState === "visible" : true;
        for (let i = offset; i < entries.length; i++) {
            let entry = entries[i];
            switch (entry.entryType) {
                case "navigation":
                    navigation.compute(entry as PerformanceNavigationTiming);
                    break;
                case "resource":
                    dimension.log(Dimension.NetworkHosts, host(entry.name));
                    break;
                case "longtask":
                    metric.count(Metric.LongTaskCount);
                    break;
                case "first-input":
                    if (visible) { metric.max(Metric.FirstInputDelay, entry["processingStart"] - entry.startTime); }
                    break;
                case "layout-shift":
                    if (visible && !entry["hadRecentInput"]) {
                        metric.sum(Metric.CumulativeLayoutShift, entry["value"]);
                    }
                    break;
                case "largest-contentful-paint":
                    if (visible) { metric.max(Metric.LargestPaint, entry.startTime); }
                    break;
            }
            lastEntryIndex++;
        }
    } else { log.log(Code.PerformanceObserver, null, Severity.Info); }
}

export function end(): void {
    if (observer) { observer.disconnect(); }
    observer = null;
    lastEntryIndex = 0;
    polling = false;
}

function host(url: string): string {
    let a = document.createElement("a");
    a.href = url;
    return a.hostname;
}

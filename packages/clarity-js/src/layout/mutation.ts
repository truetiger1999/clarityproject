import { Priority } from "@clarity-types/core";
import { Code, Event, Metric, Severity } from "@clarity-types/data";
import { Constant, MutationQueue, Source } from "@clarity-types/layout";
import { bind } from "@src/core/event";
import measure from "@src/core/measure";
import * as task from "@src/core/task";
import { time } from "@src/core/time";
import * as summary from "@src/data/summary";
import * as log from "@src/diagnostic/log";
import * as doc from "@src/layout/document";
import * as dom from "@src/layout/dom";
import encode from "@src/layout/encode";
import * as region from "@src/layout/region";
import traverse from "@src/layout/traverse";
import processNode from "./node";

let observers: MutationObserver[] = [];
let mutations: MutationQueue[] = [];
let insertRule: (rule: string, index?: number) => number = null;
let deleteRule: (index?: number) => void = null;

export function start(): void {
    observers = [];

    if (insertRule === null) { insertRule = CSSStyleSheet.prototype.insertRule; }
    if (deleteRule === null) { deleteRule = CSSStyleSheet.prototype.deleteRule; }

    // Some popular open source libraries, like styled-components, optimize performance
    // by injecting CSS using insertRule API vs. appending text node. A side effect of
    // using javascript API is that it doesn't trigger DOM mutation and therefore we
    // need to override the insertRule API and listen for changes manually.
    CSSStyleSheet.prototype.insertRule = function(rule: string, index?: number): number {
      let value = insertRule.call(this, rule, index);
      generate(this.ownerNode, Constant.CharacterData);
      return value;
    };

    CSSStyleSheet.prototype.deleteRule = function(index?: number): void {
      deleteRule.call(this, index);
      generate(this.ownerNode, Constant.CharacterData);
    };
}

export function observe(node: Node): void {
  // Create a new observer for every time a new DOM tree (e.g. root document or shadowdom root) is discovered on the page
  // In the case of shadow dom, any mutations that happen within the shadow dom are not bubbled up to the host document
  // For this reason, we need to wire up mutations every time we see a new shadow dom.
  // Also, wrap it inside a try / catch. In certain browsers (e.g. legacy Edge), observer on shadow dom can throw errors
  try {
    let observer = window["MutationObserver"] ? new MutationObserver(measure(handle) as MutationCallback) : null;
    observer.observe(node, { attributes: true, childList: true, characterData: true, subtree: true });
    observers.push(observer);
  } catch (error) { log.log(Code.MutationObserver, error, Severity.Info); }
}

export function monitor(frame: HTMLIFrameElement): void {
  // Bind to iframe's onload event so we get notified anytime there's an update to iframe content.
  // This includes cases where iframe location is updated without explicitly updating src attribute
  // E.g. iframe.contentWindow.location.href = "new-location";
  if (dom.has(frame) === false) {
    bind(frame, Constant.LoadEvent, generate.bind(this, frame, Constant.ChildList), true);
  }
}

export function stop(): void {
  for (let observer of observers) { if (observer) { observer.disconnect(); } }
  observers = [];

  // Restoring original insertRule
  if (insertRule !== null) {
    CSSStyleSheet.prototype.insertRule = insertRule;
    insertRule = null;
  }

  // Restoring original deleteRule
  if (deleteRule !== null) {
    CSSStyleSheet.prototype.deleteRule = deleteRule;
    deleteRule = null;
  }

  mutations = [];
}

function handle(m: MutationRecord[]): void {
  // Queue up mutation records for asynchronous processing
  let now = time();
  summary.track(Event.Mutation, now);
  mutations.push({ time: now, mutations: m});
  task.schedule(process, Priority.High).then((): void => {
      measure(doc.compute)();
      measure(region.compute)();
  });
}

async function process(): Promise<void> {
    let timer = Metric.LayoutCost;
    task.start(timer);
    while (mutations.length > 0) {
      let record = mutations.shift();
      for (let mutation of record.mutations) {
        let target = mutation.target;
        switch (mutation.type) {
          case Constant.Attributes:
              if (task.shouldYield(timer)) { await task.suspend(timer); }
              dom.parse(target as HTMLElement);
              processNode(target, Source.Attributes);
              break;
          case Constant.CharacterData:
              if (task.shouldYield(timer)) { await task.suspend(timer); }
              dom.parse(target as HTMLElement);
              processNode(target, Source.CharacterData);
              break;
          case Constant.ChildList:
            // Process additions
            let addedLength = mutation.addedNodes ? mutation.addedNodes.length : 0;
            for (let j = 0; j < addedLength; j++) {
              let addedNode = mutation.addedNodes[j];
              dom.parse(addedNode as HTMLElement);
              traverse(addedNode, timer, Source.ChildListAdd);
            }
            // Process removes
            let removedLength = mutation.removedNodes ? mutation.removedNodes.length : 0;
            for (let j = 0; j < removedLength; j++) {
              if (task.shouldYield(timer)) { await task.suspend(timer); }
              processNode(mutation.removedNodes[j], Source.ChildListRemove);
            }
            break;
          default:
            break;
        }
      }
      await encode(Event.Mutation, record.time);
    }
    task.stop(timer);
}

function generate(target: Node, type: MutationRecordType): void {
  measure(handle)([{
    addedNodes: [target],
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: [],
    target,
    type
  }]);
}

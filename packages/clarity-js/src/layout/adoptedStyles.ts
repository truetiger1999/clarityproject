import { Event } from "@clarity-types/data";
import { StyleSheetOperation, StyleSheetState } from "@clarity-types/layout";
import { time } from "@src/core/time";
import { shortid } from "@src/data/metadata";
import encode from "@src/layout/encode";
import { getId, getNode } from "@src/layout/dom";
import * as core from "@src/core";
import { getCssRules } from "./node";
import * as metadata from "@src/data/metadata";

export let state: StyleSheetState[] = [];
let replace: (text?: string) => Promise<CSSStyleSheet> = null;
let replaceSync: (text?: string) => void = null;
const styleSheetId = 'claritySheetId';
let styleSheetMap = {};

export function start(): void {
    reset();

    if (replace === null) { 
        replace = CSSStyleSheet.prototype.replace; 
        CSSStyleSheet.prototype.replace = function(): Promise<CSSStyleSheet> {
            if (core.active()) {
                if (!this[styleSheetId]) {
                    this[styleSheetId] = shortid();
                    // need to pass a create style sheet event (don't add it to any nodes, but do create it)
                    trackStyleChange(time(), this[styleSheetId], StyleSheetOperation.Create);
                }

                trackStyleChange(time(), this[styleSheetId], StyleSheetOperation.Replace, arguments[0]);
            }
            return replace.apply(this, arguments);
        };
    }

    if (replaceSync === null) { 
        replaceSync = CSSStyleSheet.prototype.replaceSync; 
        CSSStyleSheet.prototype.replaceSync = function(): void {
            if (core.active()) {
                if (!this[styleSheetId]) {
                    this[styleSheetId] = shortid();
                    // need to pass a create style sheet event (don't add it to any nodes, but do create it)
                    trackStyleChange(time(), this[styleSheetId], StyleSheetOperation.Create);
                }
                trackStyleChange(time(), this[styleSheetId], StyleSheetOperation.ReplaceSync, arguments[0]);
            }
            return replaceSync.apply(this, arguments);
        };
    }
}

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    return a.every((value, index) => value === b[index]);
}

export function checkDocumentStyles(documentNode: Document): void {
    if (!documentNode?.adoptedStyleSheets) {
        // if we don't have adoptedStyledSheets on the Node passed to us, we can short circuit.
        return;
    }
    let currentStyleSheets: string[] = [];
    for (var styleSheet of documentNode.adoptedStyleSheets) {
        // if we haven't seen this style sheet, create it and pass a replaceSync with its contents
        if (!styleSheet[styleSheetId]) {
            styleSheet[styleSheetId] = shortid();
            trackStyleChange(time(), styleSheet[styleSheetId], StyleSheetOperation.Create);
            trackStyleChange(time(), styleSheet[styleSheetId], StyleSheetOperation.ReplaceSync, getCssRules(styleSheet));
        }
        currentStyleSheets.push(styleSheet[styleSheetId]);
    }

    let documentId = getId(documentNode, true);
    if (!styleSheetMap[documentId]) {
        styleSheetMap[documentId] = [];
        // TODO (samart) remove
        // console.log(`saw ${documentId} for the first time`);
        // const debugTag = document.createElement("meta");
        // debugTag.innerText = `${documentId}`;
        // documentNode.head ? documentNode.head.appendChild(debugTag) : documentNode.appendChild(debugTag); 
    }
    if (!arraysEqual(currentStyleSheets, styleSheetMap[documentId])) {
        // TODO (samart) remove
        // console.log(`setting ${documentId} to have ${currentStyleSheets.length} style sheets`);
        // TODO (samart): using -1 to signify the root document node rather than relying on 1, seems like it isn't always 1
        trackStyleAdoption(time(), documentNode == document ? -1 : getId(documentNode), StyleSheetOperation.SetAdoptedStyles, currentStyleSheets);
        styleSheetMap[documentId] = currentStyleSheets;
    }
}

export function compute(): void {
    // TODO (samart): hacky but we aren't tracking document as a node it seems
    checkDocumentStyles(document);
    Object.keys(styleSheetMap).forEach((x) => checkDocumentStyles(getNode(parseInt(x, 10)) as Document));
}

export function reset(): void {
    state = [];
    
}

function trackStyleChange(time: number, id: string, operation: StyleSheetOperation, cssRules?: string): void {
    state.push({
        time,
        event: Event.StyleSheetUpdate,
        data: {
            id,
            operation,
            cssRules
        }
    });

    encode(Event.StyleSheetUpdate);
}

function trackStyleAdoption(time: number, id: number, operation: StyleSheetOperation, newIds: string[]): void {
    if (id === -1) {
        console.log(`logging we had a document styles change on page ${metadata.data.pageNum}`);
    }
    state.push({
        time,
        event: Event.StyleSheetAdoption,
        data: {
            id,
            operation,
            newIds
        }
    });

    encode(Event.StyleSheetAdoption);
}

export function stop(): void {
    styleSheetMap = {};
    // TODO (samart): I may need to refresh all the style sheets on SPA navigation - but I think its ok
    reset();
}

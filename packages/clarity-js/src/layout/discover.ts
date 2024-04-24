import { Priority, Timer } from "@clarity-types/core";
import { Dimension, Event, Metric } from "@clarity-types/data";
import { Source } from "@clarity-types/layout";
import measure from "@src/core/measure";
import * as task from "@src/core/task";
import { time } from "@src/core/time";
import { id } from "@src/data/metadata";
import * as doc from "@src/layout/document";
import encode from "@src/layout/encode";
import * as region from "@src/layout/region";
import traverse from "@src/layout/traverse";
import { checkDocumentStyles } from "@src/layout/style";
import * as scroll from "@src/interaction/scroll";
import { metadata } from "@src/layout/target";
import * as dimension from "@src/data/dimension";

export function start(): void {
    task.schedule(discover, Priority.High).then((): void => {
        measure(doc.compute)();
        measure(region.compute)();
    });
}

async function discover(): Promise<void> {
    let ts = time();
    let timer: Timer = { id: id(), cost: Metric.LayoutCost };
    task.start(timer);
    await traverse(document, timer, Source.Discover, ts);
    logInitial();
    checkDocumentStyles(document, ts);
    await encode(Event.Discover, timer, ts);
    task.stop(timer);
}

async function logInitial(): Promise<void> {
    const nodes = scroll.getTopAndBottomNodes();
    const initTop = metadata(nodes[0] as Node, null);
    const initBottom = metadata(nodes[1] as Node, null);
    dimension.log(Dimension.InitialTop, initTop?.hash?.[1]);
    dimension.log(Dimension.InitialBottom, initBottom?.hash?.[1]);
}
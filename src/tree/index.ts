import {parse, locationString} from "../parsing";
import {Scope} from "./scope";
import {ptTransform} from "./transform/transform";

export function toIR(source: string): Scope {
    try {
        const translationUnit = parse(source);
        return ptTransform(translationUnit);
    } catch (e) {
        if (e?.node?.loc) { // Transform errors
            e.message += "\n\nLocation:\n" + (locationString(e.node.loc, source) ?? "");

            if (e?.node2?.loc) {
                e.message += "\nSecondary location:\n" + (locationString(e.node2.loc, source) ?? "");
            }
        }
        throw e;
    }
}

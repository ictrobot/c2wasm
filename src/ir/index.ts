import {parse, locationString} from "../parsing";
import {Scope} from "./scope";
import {ptTransform} from "./transform/transform";

export function toIR(source: string): Scope {
    try {
        const translationUnit = parse(source);
        return ptTransform(translationUnit);
    } catch (e) {
        if (e?.node?.loc) { // Transform errors
            e.message += "\n\n" + (locationString(e.node.loc, source) ?? "");
        }
        throw e;
    }
}

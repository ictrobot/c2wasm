import {parse} from "../parsing";
import {Scope} from "./scope";
import {ptTransform} from "./transform/transform";

export function toIR(source: string): Scope {
    const translationUnit = parse(source);
    return ptTransform(translationUnit);
}

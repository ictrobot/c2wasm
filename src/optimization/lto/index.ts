import {ModuleBuilder} from "../../wasm";
import {getFlags} from "../flags";
import {inlineFunctions} from "./functions";

export function ltoOptimize(module: ModuleBuilder): void {
    const flags = getFlags();
    if (flags.inlining) inlineFunctions(module);
}

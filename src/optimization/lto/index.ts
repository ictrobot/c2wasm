import {ModuleBuilder} from "../../wasm";
import {getFlags} from "../flags";
import {inlineFunctions} from "./inlining";

export function ltoOptimize(module: ModuleBuilder): void {
    const flags = getFlags();
    if (flags.inlining) inlineFunctions(module);
}

import {toIR} from "../tree";
import {ModuleBuilder} from "../wasm";
import {WGenerator} from "./generator";

export function compile(source: string): ModuleBuilder {
    const scope = toIR(source);
    const generator = new WGenerator(scope);
    return generator.module;
}

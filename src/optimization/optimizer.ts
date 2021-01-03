import {WExpression} from "../wasm";
import {OptimizationFlags} from "./flags";

export interface Optimizer {
    name: string,
    enabled: (flags: OptimizationFlags) => boolean,
    run(expr: WExpression): void
}

import {WExpression} from "../wasm";
import {OptimisationFlags} from "./flags";

export interface Optimiser {
    name: string,
    enabled: (flags: OptimisationFlags) => boolean,
    run(expr: WExpression): void
}

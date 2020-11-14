import {ParseNode} from "../parsing";
import {CFuncDeclaration} from "./declarations";
import {Scope} from "./scope";
import {CFuncType, CVoid, CArithmetic} from "./types";

const fakeParseNode: ParseNode = new class extends ParseNode {
    readonly type: string = "__internal__";

    constructor() {
        super({first_line: 0, first_column: 0, last_line: 0, last_column: 0, _source: "", _sourceId: -1});
    }
}();

export const INTERNAL_FNS: {[s: string]: CFuncDeclaration} = {
    /** For executing arbitrary Wasm
     *
     * __wasm_push__([byte1], [bytes]...]);
     */
    wasm: new CFuncDeclaration(
        fakeParseNode,
        "__wasm__",
        new CFuncType(fakeParseNode, new CVoid(), [CArithmetic.U8], undefined, true),
        "static"
    ),
    /** For executing arbitrary Wasm returning i32
     *
     * __wasm_i32__([byte1], [bytes]...]);
     */
    wasm_i32: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_i32__",
        new CFuncType(fakeParseNode, CArithmetic.U32, [CArithmetic.U8], undefined, true),
        "static"
    ),
    /** For executing arbitrary Wasm returning i64
     *
     * __wasm_i64__([byte1], [bytes]...]);
     */
    wasm_i64: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_i64__",
        new CFuncType(fakeParseNode, CArithmetic.U64, [CArithmetic.U8], undefined, true),
        "static"
    ),
    /** For executing arbitrary Wasm returning f32
     *
     * __wasm_f32__([byte1], [bytes]...]);
     */
    wasm_f32: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_f32__",
        new CFuncType(fakeParseNode, CArithmetic.Fp32, [CArithmetic.U8], undefined, true),
        "static"
    ),
    /** For executing arbitrary Wasm returning f64
     *
     * __wasm_f64__([byte1], [bytes]...]);
     */
    wasm_f64: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_f64__",
        new CFuncType(fakeParseNode, CArithmetic.Fp64, [CArithmetic.U8], undefined, true),
        "static"
    ),
    /** For pushing arbitrary values onto the Wasm stack
     *
     * __wasm_push__([count], expr1, expr2, ...);
     */
    wasm_push: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_push__",
        new CFuncType(fakeParseNode, new CVoid(), [CArithmetic.U32], undefined, true),
        "static"
    ),
};

export const INTERNAL_SCOPE = new Scope();
Object.values(INTERNAL_FNS).forEach(x => INTERNAL_SCOPE.addIdentifier(x));

import {ParseNode} from "../parsing";
import {CFuncDeclaration} from "./declarations";
import {Scope} from "./scope";
import {CFuncType, CVoid, CArithmetic, CPointer} from "./types";

const fakeParseNode: ParseNode = new class extends ParseNode {
    readonly type: string = "__internal__";

    constructor() {
        super({first_line: 0, first_column: 0, last_line: 0, last_column: 0, _source: "", _sourceId: -1});
    }
}();

export const INTERNAL_FNS = {
    /** For executing arbitrary Wasm. Should NOT contain control flow as the code will not be processed
     * by optimizations. Similarly, locals should only be accessed as parameters as they map be remapped.
     *
     * __wasm_push__([#parameters], [parameter1], [parameter2], ..., [byte1], [byte2]...);
     */
    wasm: new CFuncDeclaration(
        fakeParseNode,
        "__wasm__",
        new CFuncType(fakeParseNode, new CVoid(), [CArithmetic.U32], undefined, true),
        "internal"
    ),
    /** For executing arbitrary Wasm* returning i32 */
    wasm_i32: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_i32__",
        new CFuncType(fakeParseNode, CArithmetic.U32, [CArithmetic.U32], undefined, true),
        "internal"
    ),
    /** For executing arbitrary Wasm* returning i64 */
    wasm_i64: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_i64__",
        new CFuncType(fakeParseNode, CArithmetic.U64, [CArithmetic.U32], undefined, true),
        "internal"
    ),
    /** For executing arbitrary Wasm* returning f32 */
    wasm_f32: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_f32__",
        new CFuncType(fakeParseNode, CArithmetic.Fp32, [CArithmetic.U32], undefined, true),
        "internal"
    ),
    /** For executing arbitrary Wasm* returning f64 */
    wasm_f64: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_f64__",
        new CFuncType(fakeParseNode, CArithmetic.Fp64, [CArithmetic.U32], undefined, true),
        "internal"
    ),
    /** For getting the value of the shadow stack pointer
     *
     * __wasm_ssp__();
     */
    wasm_ssp: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_ssp__",
        new CFuncType(fakeParseNode, new CPointer(fakeParseNode, new CVoid(), true), []),
        "internal"
    ),
    /**
     * Wasm real type load - compensates for conversation/type_conversion.ts realType()
     * Most C values are directly stored as Wasm values, but CStruct and CUnions have to be stored as pointers.
     * This isn't directly expressed in the type information, and so this function is needed for any C directly manipulating memory.
     *
     * __wasm_rload__([ptr]);
     */
    wasm_rload: new CFuncDeclaration(
        fakeParseNode,
        "__wasm_rload__",
        new CFuncType(fakeParseNode, new CPointer(fakeParseNode, new CVoid(), true), [new CPointer(fakeParseNode, new CVoid(), true)]),
        "internal"
    )
};

export const INTERNAL_SCOPE = new Scope();
Object.values(INTERNAL_FNS).forEach(x => INTERNAL_SCOPE.addIdentifier(x));

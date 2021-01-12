import {getFlags} from "../optimization/flags";
import {CFuncDefinition, CFuncDeclaration} from "../tree/declarations";
import {CIdentifier} from "../tree/expressions";
import * as c from "../tree/expressions";
import {constExpression} from "../tree/transform/constant_expressions";
import {CType, CArithmetic, CPointer, CArray, CSizeT, CUnion, CStruct, CFuncType, integerPromotion} from "../tree/types";
import {i32Type, Instructions, i64Type, f32Type, f64Type, ValueType} from "../wasm";
import {WInstruction} from "../wasm/instructions";
import {GenError} from "./gen_error";
import {WFnGenerator} from "./generator";
import {storageGet, storageSet, storageUpdate, storageGetThenUpdate, getAddress} from "./storage";
import {ImplementationType, implType, conversion, valueType, realType} from "./type_conversion";
import {internalFunctions} from "./wasm_functions";

function constant(ctx: WFnGenerator, e: c.CConstant, discard: boolean): WInstruction[] {
    if (discard) return []; // no possible side effects

    return [gInstr(valueType(e.type), "const", e.value)];
}

function identifier(ctx: WFnGenerator, e: c.CIdentifier, discard: boolean): WInstruction[] {
    if (discard) return []; // no possible side effects

    if (e.value instanceof CFuncDefinition || e.value instanceof CFuncDeclaration) {
        // get function pointer
        return [Instructions.i32.const(ctx.gen.indirectIndex(e.value))];
    }
    return storageGet(ctx, e.type, e);
}

function arrayPointer(ctx: WFnGenerator, e: c.CArrayPointer, discard: boolean): WInstruction[] {
    if (discard) return []; // no possible side effects
    if (e.arrayIdentifier instanceof c.CStringLiteral) return stringLiteral(ctx, e.arrayIdentifier, discard);

    return getAddress(ctx, e.arrayIdentifier);
}

function stringLiteral(ctx: WFnGenerator, e: c.CStringLiteral, discard: boolean): WInstruction[] {
    if (discard) return []; // no possible side effects
    const stringAddress = ctx.gen.nextStaticAddr; // chars allowed to be 1-byte aligned
    ctx.gen.nextStaticAddr += e.value.length;

    ctx.gen.module.dataSegment(stringAddress, e.value.map(Number));
    return [Instructions.i32.const(stringAddress)];
}

/**
 * Stack has to contain function arguments.
 * If any argument (or function pointer) is varadic then it will try to manipulate the same region so need to call all
 * child expressions before storing. This means pushing everything onto the stack in the right order.
 * - evaluate normal function arguments
 * - (evaluate indirect function id)
 * - (evaluate variadic arguments)
 * - (store variadic arguments)
 * - increment shadow stack pointer
 * - call function (and cleanup)
 * - decrement shadow stack pointer
 */
function functionCall(ctx: WFnGenerator, e: c.CFunctionCall, discard: boolean): WInstruction[] {
    const indirectValue: WInstruction[] = [];
    if (e.body instanceof c.CIdentifier && (e.body.value instanceof CFuncDefinition || e.body.value instanceof CFuncDeclaration)) {
        // normal function call
    } else if (e.body.type instanceof CFuncType || (e.body.type instanceof CPointer && e.body.type.type instanceof CFuncType)) {
        // indirect function call
        indirectValue.push(...subExpr(ctx, e.body, e.body.type));
    } else {
        throw new GenError("Invalid fn call identifier", ctx, e.body.node);
    }

    const internalExpression = internalFunctions(ctx, e, discard); // __wasm__ etc
    if (internalExpression !== undefined) {
        if (e.fnType.returnType.bytes > 0 && discard) internalExpression.push(Instructions.drop());
        return internalExpression;
    }

    const instr = e.fnType.parameterTypes.flatMap((t, i) => subExpr(ctx, e.args[i], t));
    if (indirectValue.length > 0) {
        // indirect call index
        instr.push(...indirectValue);
    }

    let shadowUsage = ctx.shadowStackUsage;
    if (e.fnType.variadic) {
        // push variadic variables onto stack
        const types: ValueType[] = [];
        for (let i = e.fnType.parameterTypes.length; i < e.args.length; i++) {
            // default argument promotions
            let type = e.args[i].type;
            if (type instanceof CArithmetic) {
                if (type.type === "float") type = CArithmetic.Fp64;
                else type = integerPromotion(type);
            }

            // storing realType so C code needs to do __wasm_rload__ to account for structs being pointers etc
            types.unshift(realType(type));
            instr.push(Instructions.global.get(ctx.gen.shadowStackPtr), ...subExpr(ctx, e.args[i], type));
        }

        shadowUsage += 16; // empty region to help prevent overruns
        for (const type of types) {
            instr.push(gInstr(type, "store", type === i64Type || type === f64Type ? 3 : 2, shadowUsage));
            shadowUsage += 8;
        }
    }
    if (shadowUsage > 0) {
        // increment shadow stack pointer for callee
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr),
            Instructions.i32.const(shadowUsage),
            Instructions.i32.add(),
            Instructions.global.set(ctx.gen.shadowStackPtr));
    }

    // do actual call
    if (indirectValue.length > 0) {
        instr.push(Instructions.call_indirect(ctx.gen.typeIndex(e.fnType)));
    } else {
        // direct call
        const fn = (e.body as CIdentifier).value as CFuncDeclaration | CFuncDefinition;
        instr.push(Instructions.call(ctx.gen.functionIndex(fn)));
    }

    if (discard && e.fnType.returnType.bytes > 0) {
        // cleanup return value if needed
        instr.push(Instructions.drop());
    }
    if (shadowUsage > 0) {
        // restore shadow stack pointer
        instr.push(Instructions.global.get(ctx.gen.shadowStackPtr),
            Instructions.i32.const(shadowUsage),
            Instructions.i32.sub(),
            Instructions.global.set(ctx.gen.shadowStackPtr));
    }
    return instr;
}

function memberAccess(ctx: WFnGenerator, e: c.CMemberAccess, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true);

    return storageGet(ctx, e.type, e);
}

function incrDecr(ctx: WFnGenerator, e: c.CIncrDecr, discard: boolean): WInstruction[] {
    const amount = e.type instanceof CPointer ? e.type.type.bytes : 1;
    const type = realType(e.type);

    if (e.pos === "post" && !discard) {
        return storageGetThenUpdate(ctx, e.body.type, e.body, [
            gConst(type, amount),
            gInstr(type, e.op === "++" ? "add" : "sub"),
        ]);
    } else {
        // can convert post and discard => pre with discard

        return storageUpdate(ctx, e.body.type, e.body, [
            gConst(type, amount),
            gInstr(type, e.op === "++" ? "add" : "sub"),
        ], !discard && e.pos === "pre");
    }
}

function addressOf(ctx: WFnGenerator, e: c.CAddressOf, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    if (e.body instanceof CIdentifier && (e.body.value instanceof CFuncDefinition || e.body.value instanceof CFuncDeclaration)) {
        // get function pointer
        return [Instructions.i32.const(ctx.gen.indirectIndex(e.body.value))];
    }
    return getAddress(ctx, e.body);
}

function dereference(ctx: WFnGenerator, e: c.CDereference, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    if (e.type instanceof CFuncType) {
        // don't do final deref of function pointers
        return expressionGeneration(ctx, e.body, false);
    }
    return storageGet(ctx, e.type, e);
}

function unaryPlusMinus(ctx: WFnGenerator, e: c.CUnaryPlusMinus, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    const instr = expressionGeneration(ctx, e.body, false);
    if (e.op === "-") {
        const type = implType(e.body.type);
        if (type === f32Type || type === f64Type) {
            instr.push(fInstr(type, "neg"));
        } else {
            instr.unshift(gConst(type, 0));
            instr.push(gInstr(type, "sub"));
        }
    }
    return instr;
}

function bitwiseNot(ctx: WFnGenerator, e: c.CBitwiseNot, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    const wType = valueType(e.type);
    return [...subExpr(ctx, e.body, e.type), iInstr(wType, "const", -1n), iInstr(wType, "xor")];
}

function logicalNot(ctx: WFnGenerator, e: c.CLogicalNot, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    const instr = expressionGeneration(ctx, e.body, false);
    const wType = realType(e.body.type);

    if (isIValueType(wType)) {
        return [...instr, iInstr(wType, "eqz")];
    } else {
        return [...instr, fInstr(wType, "const", 0), fInstr(wType, "eq")];
    }
}

function sizeof(ctx: WFnGenerator, e: c.CSizeof, discard: boolean): WInstruction[] {
    if (discard) return []; // no possible side effects

    return [Instructions.i32.const(e.body.bytes)];
}

function cast(ctx: WFnGenerator, e: c.CCast, discard: boolean): WInstruction[] {
    if (discard) return expressionGeneration(ctx, e.body, true); // get any side effects

    return [...expressionGeneration(ctx, e.body, false), ...conversion(e.body.type, e.type)];
}

function mulDiv(ctx: WFnGenerator, e: c.CMulDiv, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const instr = [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type)];
    const wType = valueType(e.type);
    if (isIValueType(wType)){
        if (e.op === "*") instr.push(iInstr(wType, "mul"));
        else instr.push(e.type.type === "signed" ? iInstr(wType, "div_s") : iInstr(wType, "div_u"));
    } else {
        instr.push(e.op === "*" ? fInstr(wType, "mul") : fInstr(wType, "div"));
    }

    return instr;
}

function mod(ctx: WFnGenerator, e: c.CMod, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const wType = valueType(e.type);
    if (e.type.type === "signed") {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "rem_s")];
    } else {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "rem_u")];
    }
}

function addSub(ctx: WFnGenerator, e: c.CAddSub, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    if (e.type instanceof CArithmetic) {
        const lhs = subExpr(ctx, e.lhs, e.type);
        const rhs = subExpr(ctx, e.rhs, e.type);
        const wType = valueType(e.type);
        return [...lhs, ...rhs, e.op === "+" ? gInstr(wType, "add") : gInstr(wType, "sub")];
    } else {
        // eslint-disable-next-line no-inner-declarations
        function toExpr(side: c.CExpression) {
            if (side.type instanceof CPointer) {
                return ctx.expression(side, false);
            } else { // if side.type === integer
                const instr = subExpr(ctx, side, CArithmetic.U32);
                const size = (e.type as CPointer).type.bytes;
                if (size > 1) instr.push(Instructions.i32.const(size), Instructions.i32.mul());
                return instr;
            }
        }

        return [...toExpr(e.lhs), ...toExpr(e.rhs), e.op === "+" ? Instructions.i32.add() : Instructions.i32.sub()];
    }
}

function shift(ctx: WFnGenerator, e: c.CShift, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const wType = valueType(e.type);
    if (e.dir === "left") {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "shl")];
    } else if (e.type.type === "signed") {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "shr_s")];
    } else {
        return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(wType, "shr_u")];
    }
}

function relational(ctx: WFnGenerator, e: c.CRelational, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    const wType = valueType(e.commonType);
    if (!isIValueType(wType)) {
        return [...subExpr(ctx, e.lhs, e.commonType), ...subExpr(ctx, e.rhs, e.commonType),
            e.op === "LT" ? fInstr(wType, "lt") :
                e.op === "GT" ? fInstr(wType, "gt") :
                    e.op === "LEq" ? fInstr(wType, "le") : fInstr(wType, "ge")];
    } else if (e.commonType.type === "signed") {
        return [...subExpr(ctx, e.lhs, e.commonType), ...subExpr(ctx, e.rhs, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_s") :
                e.op === "GT" ? iInstr(wType, "gt_s") :
                    e.op === "LEq" ? iInstr(wType, "le_s") : iInstr(wType, "ge_s")];
    } else {
        return [...subExpr(ctx, e.lhs, e.commonType), ...subExpr(ctx, e.rhs, e.commonType),
            e.op === "LT" ? iInstr(wType, "lt_u") :
                e.op === "GT" ? iInstr(wType, "gt_u") :
                    e.op === "LEq" ? iInstr(wType, "le_u") : iInstr(wType, "ge_u")];
    }
}

function equality(ctx: WFnGenerator, e: c.CEquality, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    return [
        ...subExpr(ctx, e.lhs, e.commonType),
        ...subExpr(ctx, e.rhs, e.commonType),
        gInstr(valueType(e.commonType), e.op === "==" ? "eq" : "ne")];
}

function bitwiseAndOr(ctx: WFnGenerator, e: c.CBitwiseAndOr, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    return [...subExpr(ctx, e.lhs, e.type), ...subExpr(ctx, e.rhs, e.type), iInstr(valueType(e.type), e.op)];
}

function logicalAndOr(ctx: WFnGenerator, e: c.CLogicalAndOr, discard: boolean): WInstruction[] {
    if (discard) return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, true)];

    if (e.op === "and") {
        return [...condition(ctx, e.lhs), Instructions.if(i32Type, condition(ctx, e.rhs, false), [
            Instructions.i32.const(0n)
        ])];
    } else { // op === "or"
        return [...condition(ctx, e.lhs), Instructions.if(i32Type, [
            Instructions.i32.const(1n)
        ], condition(ctx, e.rhs, false))];
    }
}

function conditional(ctx: WFnGenerator, e: c.CConditional, discard: boolean): WInstruction[] {
    const test = condition(ctx, e.test);
    if (discard) {
        const trueSideEffects = expressionGeneration(ctx, e.trueValue, true);
        const falseSideEffects = expressionGeneration(ctx, e.falseValue,true);
        if (trueSideEffects.length === 0 && falseSideEffects.length === 0) return [];

        return [...test, Instructions.if(null, trueSideEffects, falseSideEffects)];
    } else {
        return [...test, Instructions.if(realType(e.type),
            subExpr(ctx, e.trueValue, e.type),
            subExpr(ctx, e.falseValue, e.type))];
    }
}

function assignment(ctx: WFnGenerator, e: c.CAssignment, discard: boolean): WInstruction[] {
    if (e.assignmentType !== undefined && !(e.rhs instanceof c.CInitializer)) {
        let body: c.CExpression;
        if (e.assignmentType === "mul") {
            body = new c.CMulDiv(e.node, e.lhs, e.rhs, "*");
        } else if (e.assignmentType === "div") {
            body = new c.CMulDiv(e.node, e.lhs, e.rhs, "/");
        } else if (e.assignmentType === "mod") {
            body = new c.CMod(e.node, e.lhs, e.rhs);
        } else if (e.assignmentType === "add") {
            body = new c.CAddSub(e.node, e.lhs, e.rhs, "+");
        } else if (e.assignmentType === "sub") {
            body = new c.CAddSub(e.node, e.lhs, e.rhs, "-");
        } else if (e.assignmentType === "leftShift") {
            body = new c.CShift(e.node, e.lhs, e.rhs, "left");
        } else if (e.assignmentType === "rightShift") {
            body = new c.CShift(e.node, e.lhs, e.rhs, "right");
        } else if (e.assignmentType === "bitwiseAnd") {
            body = new c.CBitwiseAndOr(e.node, e.lhs, e.rhs, "and");
        } else if (e.assignmentType === "bitwiseXor") {
            body = new c.CBitwiseAndOr(e.node, e.lhs, e.rhs, "xor");
        } else {
            body = new c.CBitwiseAndOr(e.node, e.lhs, e.rhs, "or");
        }

        // try to convert "body" into instructions, then remove the instructions which load the lhs to create transformation
        const transform = expressionGeneration(ctx, body, false);
        const lhs = expressionGeneration(ctx, e.lhs, false);
        return storageUpdate(ctx, e.lhs.type, e.lhs, transform.slice(lhs.length), !discard);
    } else if (e.rhs instanceof c.CInitializer) {
        const instr: WInstruction[] = [];

        if (e.rhs.type instanceof CArray) {
            const lhs = e.lhs instanceof c.CIdentifier ? new c.CArrayPointer(e.lhs.node, e.lhs) : e.lhs;
            for (let i = 0; i < e.rhs.body.length; i++) {
                const value = e.rhs.body[i];

                const entryPointer = new c.CAddSub(lhs.node, lhs, new c.CConstant(lhs.node, CSizeT, BigInt(i)), "+");
                const entryDeref = new c.CDereference(lhs.node, entryPointer);
                const entryAssignment = new c.CAssignment(value.node, entryDeref, value, undefined, e.initialAssignment);
                instr.push(...expressionGeneration(ctx, entryAssignment, true));
            }
        } else if (e.rhs.type instanceof CUnion) {
            const addr = new c.CAddressOf(e.lhs.node, e.lhs);
            const access = new c.CMemberAccess(e.rhs.node, addr, e.rhs.type.members[0].name);
            const assignment = new c.CAssignment(e.rhs.body[0].node, access, e.rhs.body[0], undefined, true);
            instr.push(...expressionGeneration(ctx, assignment, true));
        } else if (e.rhs.type instanceof CStruct) {
            const addr = new c.CAddressOf(e.lhs.node, e.lhs);

            for (let i = 0; i < e.rhs.body.length; i++) {
                const access = new c.CMemberAccess(e.rhs.node, addr, e.rhs.type.members[i].name);
                const assignment = new c.CAssignment(e.rhs.body[i].node, access, e.rhs.body[i], undefined, true);
                instr.push(...expressionGeneration(ctx, assignment, true));
            }
        } else {
            throw new GenError("Unknown initializer", ctx, e.node);
        }

        if (!discard) instr.push(...expressionGeneration(ctx, e.lhs, false));
        return instr;
    } else {
        return storageSet(ctx, e.lhs.type, e.lhs, e.rhs, !discard);
    }
}

function comma(ctx: WFnGenerator, e: c.CComma, discard: boolean): WInstruction[] {
    return [...expressionGeneration(ctx, e.lhs, true), ...expressionGeneration(ctx, e.rhs, discard)];
}

export function expressionGeneration(ctx: WFnGenerator, e: c.CExpression, discard: boolean): WInstruction[] {
    if (!discard && e.type instanceof CArithmetic && !(e instanceof c.CConstant) && getFlags().generation_try_constant_expr) {
        // try to evaluate as constant expression
        try {
            const value = constExpression(e);
            return constant(ctx, new c.CConstant(e.node, e.type, value.value), false);
        } catch (e) {
            // failed - not a constant expression
        }
    }

    if (e instanceof c.CConstant) return constant(ctx, e, discard);
    else if (e instanceof c.CIdentifier) return identifier(ctx, e, discard);
    else if (e instanceof c.CArrayPointer) return arrayPointer(ctx, e, discard);
    else if (e instanceof c.CStringLiteral) return stringLiteral(ctx, e, discard);
    else if (e instanceof c.CFunctionCall) return functionCall(ctx, e, discard);
    else if (e instanceof c.CMemberAccess) return memberAccess(ctx, e, discard);
    else if (e instanceof c.CIncrDecr) return incrDecr(ctx, e, discard);
    else if (e instanceof c.CAddressOf) return addressOf(ctx, e, discard);
    else if (e instanceof c.CDereference) return dereference(ctx, e, discard);
    else if (e instanceof c.CUnaryPlusMinus) return unaryPlusMinus(ctx, e, discard);
    else if (e instanceof c.CBitwiseNot) return bitwiseNot(ctx, e, discard);
    else if (e instanceof c.CLogicalNot) return logicalNot(ctx, e, discard);
    else if (e instanceof c.CSizeof) return sizeof(ctx, e, discard);
    else if (e instanceof c.CCast) return cast(ctx, e, discard);
    else if (e instanceof c.CMulDiv) return mulDiv(ctx, e, discard);
    else if (e instanceof c.CMod) return mod(ctx, e, discard);
    else if (e instanceof c.CAddSub) return addSub(ctx, e, discard);
    else if (e instanceof c.CShift) return shift(ctx, e, discard);
    else if (e instanceof c.CRelational) return relational(ctx, e, discard);
    else if (e instanceof c.CEquality) return equality(ctx, e, discard);
    else if (e instanceof c.CBitwiseAndOr) return bitwiseAndOr(ctx, e, discard);
    else if (e instanceof c.CLogicalAndOr) return logicalAndOr(ctx, e, discard);
    else if (e instanceof c.CConditional) return conditional(ctx, e, discard);
    else if (e instanceof c.CAssignment) return assignment(ctx, e, discard);
    else return comma(ctx, e, discard);
}

// helpers
/** expressionGeneration + casting */
export function subExpr(ctx: WFnGenerator, e: c.CExpression, desiredType: CType, discard: boolean = false): WInstruction[] {
    const fakeCast = new c.CCast(e.node, desiredType, e);
    return expressionGeneration(ctx, fakeCast, discard);
}

export function condition(ctx: WFnGenerator, e: c.CExpression, anyNonZeroI32 = true): WInstruction[] {
    const wType = implType(e.type);
    if (wType === i32Type || wType instanceof CPointer) {
        if (anyNonZeroI32 || CArithmetic.BOOL.equals(e.type)) {
            return expressionGeneration(ctx, e, false);
        } else {
            return [...expressionGeneration(ctx, e, false), Instructions.i32.const(0n), Instructions.i32.ne()];
        }
    } else if (typeof wType !== "number") {
        throw new GenError("Invalid condition", ctx, e.node);
    }
    return [...expressionGeneration(ctx, e, false), gConst(wType, 0), gInstr(wType, "ne")];
}

function isIValueType(w: ImplementationType) {
    return w === i32Type || w === i64Type;
}

/** f32 or f64 instruction */
function fInstr(t: ImplementationType, op: (keyof typeof Instructions.f32 & keyof typeof Instructions.f64), ...args: any[]) {
    if (typeof t !== "number") throw new Error("Instructions can only operate on value types");

    if (t === f32Type) {
        // @ts-ignore
        return Instructions.f32[op](...args);
    } else if (t === f64Type) {
        // @ts-ignore
        return Instructions.f64[op](...args);
    }
    throw new Error("Invalid value type for floating point instruction");
}

/** i32 or i64 instruction */
function iInstr(t: ImplementationType, op: (keyof typeof Instructions.i32 & keyof typeof Instructions.i64), ...args: any[]) {
    if (typeof t !== "number") throw new Error("Instructions can only operate on value types");

    if (t === i32Type) {
        // @ts-ignore
        return Instructions.i32[op](...args);
    } else if (t === i64Type) {
        // @ts-ignore
        return Instructions.i64[op](...args);
    }
    throw new Error("Invalid value type for integer instruction");
}

/** generic instruction - i32, i64, f32 or f64 */
export function gInstr(t: ImplementationType, op: (keyof typeof Instructions.i32 & keyof typeof Instructions.i64 & keyof typeof Instructions.f32 & keyof typeof Instructions.f64), ...args: any[]) {
    if (typeof t !== "number") throw new Error("Instructions can only operate on value types");

    if (t === i32Type) {
        // @ts-ignore
        return Instructions.i32[op](...args);
    } else if (t === i64Type) {
        // @ts-ignore
        return Instructions.i64[op](...args);
    } else if (t === f32Type) {
        // @ts-ignore
        return Instructions.f32[op](...args);
    } else if (t === f64Type) {
        // @ts-ignore
        return Instructions.f64[op](...args);
    }
    throw new Error("Invalid value type?");
}

/** generic constant */
function gConst(t: ImplementationType, n: number) {
    if (typeof t !== "number") throw new Error("Constants can only take value types");
    if (t !== (t | 0)) throw new Error("Invalid generic constant - not integer");

    if (t === i32Type) {
        return Instructions.i32.const(BigInt(n));
    } else if (t === i64Type) {
        return Instructions.i64.const(BigInt(n));
    } else if (t === f32Type) {
        return Instructions.f32.const(n);
    } else if (t === f64Type) {
        return Instructions.f64.const(n);
    }
    throw new Error("Invalid value type?");
}

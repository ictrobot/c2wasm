import {byte, labelidx} from "./base_types";
import {encodeU32} from "./encoding";
import {WFunctionBuilder, WLocal} from "./functions";
import {WGlobal} from "./global";
import {ValueType, i32Type, encodeVec} from "./wtypes";

export type ReadResource = "memory" | WLocal | WGlobal;
export type WriteResource = "jump" | "arbitraryCode" | ReadResource;

type Context = {
    depth: number;
    builder: WFunctionBuilder,
    stack: ReadonlyArray<ValueType>;
};
type InstrContext<T> = (c: Context) => T;
export type PartialInstr = InstrContext<InstrInstance>;

export interface BaseInstance<T extends BaseInstance<T>> {
    readonly name: string;
    readonly type: string;
    readonly immediate: object;

    /* Instruction as bytes */
    encoded: ReadonlyArray<byte>;
    /* Values consumed from stack, parameters[n-1] being top of the stack */
    readonly parameters: ReadonlyArray<ValueType>;
    /* Value pushed onto stack if any */
    readonly result: ValueType | null;

    readonly reads: ReadonlyArray<ReadResource>;
    /* Resource written to */
    readonly writes: ReadonlyArray<WriteResource>;

    /* deep copy a function without re-evaluate parameters */
    copy(): InstrContext<T>;
}

export type InstrInstance = ZeroArgInstance | ConstantInstance<bigint | number> | MemInstance | IdxInstance | TableInstance | StructureInstance;

// Zero argument instructions
interface ZeroArgInstance extends BaseInstance<ZeroArgInstance> {
    type: "zeroArg";
    immediate: {};
}

export function zeroArgs(name: string, opcode: number[], parameters: ReadonlyArray<ValueType>, result: ValueType | null,
                         reads: ReadResource[] = [], writes: WriteResource[] = []): () => InstrContext<ZeroArgInstance> {
    const instr: ZeroArgInstance = {
        name,
        type: "zeroArg", immediate: {},
        encoded: opcode as byte[],
        parameters, result,
        reads, writes,

        copy() {
            return () => this;
        }
    };
    return () => () => instr;
}

type DataFlow = {parameters: ValueType[], result: ValueType | null, reads: ReadResource[], writes: WriteResource[]};
export function zeroArgsSpecial(name: string, opcode: number[], specialFn: InstrContext<DataFlow>): () => InstrContext<ZeroArgInstance> {
    return () => (context) => {
        const {parameters, result, reads, writes} = specialFn(context);
        return {
            name, type: "zeroArg", immediate: {},
            encoded: opcode as byte[],
            parameters, result,
            reads, writes,

            copy() {
                return () => this;
            }
        };
    };
}

// Arithmetic constant instructions
interface ConstantInstance<T extends bigint | number> extends BaseInstance<ConstantInstance<T>> {
    type: "constant";
    immediate: {readonly value: T};
    result: ValueType;
}

export function constantArg<T extends bigint | number>(name: string, opcode: number[],
                                                       encodeFn: (x: T) => byte[],
                                                       typeFn: (x: T) => T,
                                                       result: ValueType): (x: T) => InstrContext<ConstantInstance<T>> {
    return (value) => () => ({
        name, type: "constant",
        immediate: {value: typeFn(value)},
        encoded: [...opcode as byte[], ...encodeFn(value)],
        parameters: [], result,
        reads: [], writes: [],

        copy() {
            return () => this;
        }
    });
}

// Memory argument instructions
interface MemInstance extends BaseInstance<MemInstance> {
    type: "memory";
    immediate: {readonly align: bigint, readonly offset: bigint};
}

export function memArg(name: string, opcode: number[],
                       type: "load" | "store", valueType: ValueType): (align: number | bigint, offset: number | bigint) => InstrContext<MemInstance> {
    return (align, offset) => {
        if (typeof align === "number") align = BigInt(align);
        if (typeof offset === "number") offset = BigInt(offset);
        const encoded = [...opcode as byte[], ...encodeU32(align), ...encodeU32(offset)];
        const args = {align, offset};

        return () => ({
            name, encoded,
            type: "memory", immediate: args,
            parameters: type === "load" ? [i32Type] : [i32Type, valueType],
            result: type === "load" ? valueType : null,
            reads: type === "load" ? ["memory"] : [],
            writes: type === "load" ? [] : ["memory"],

            copy() {
                return () => this;
            }
        });
    };
}

// Index argument instructions

// either an index (instance of T), an object with a getter for the index
// or a plain number to make the api easier to use
type Index<T extends bigint> = number | T | {getIndex(depth: number): T};
interface IdxInstance extends BaseInstance<IdxInstance> {
    type: "index";
    immediate: {readonly value: bigint};
}

function getIndex<T extends bigint>(idx: Index<T>, depth: number): T {
    let value: T;
    if (typeof idx === "number") {
        value = BigInt(idx) as T;
    } else if (typeof idx === "bigint") {
        value = idx as T;
    } else {
        value = idx.getIndex(depth);
    }
    return value;
}

type IndexFn<T extends bigint, X> = (c: Context & {value: T, extra: X}) => DataFlow;
export function idxArg<T extends bigint, X extends any[]>(name: string, opcode: number[], suffix: number[],
                                                          stackOps: IndexFn<T, X>): (x: Index<T>, ...extra: X) => InstrContext<IdxInstance> {
    return (x, ...extra) => context => {
        const value = getIndex(x, context.depth);
        const encoded = [...opcode as byte[], ...encodeU32(value), ...suffix as byte[]];
        const {parameters, result, reads, writes} = stackOps({value, extra, ...context});

        return {
            name, encoded,
            type: "index", immediate: {value},
            parameters, result,
            reads, writes,

            copy() {
                return () => this;
            }
        };
    };
}

interface TableInstance extends BaseInstance<TableInstance> {
    type: "table";
    immediate: {readonly defaultValue: bigint, readonly valueTable: ReadonlyArray<bigint>};
}

export function brTableInstr(opcode: number): (defaultLbl: Index<labelidx>, lblArray: Index<labelidx>[]) => InstrContext<TableInstance> {
    return (defaultLbl, lblArray) => context => {
        const defaultValue = getIndex(defaultLbl, context.depth);
        const valueTable = lblArray.map(x => getIndex(x, context.depth));
        const encoded = [opcode as byte, ...encodeVec(valueTable.map(encodeU32)), ...encodeU32(defaultValue)];

        return {
            name: "br_table", encoded,
            type: "table", immediate: {defaultValue, valueTable},
            parameters: [i32Type], result: null,
            reads: [], writes: ["jump"],

            copy() {
                return () => this;
            }
        };
    };
}

// Structured instructions
type StructureInstance = BlockLoopInstance | IfInstance;
interface BlockLoopInstance extends BaseInstance<BlockLoopInstance> {
    type: "structured";
    name: "block" | "loop";
    immediate: {readonly type: ValueType | null, readonly expression: WExpression, readonly expression2: undefined};
}

interface IfInstance extends BaseInstance<IfInstance> {
    type: "structured";
    name: "if";
    immediate: {readonly type: ValueType | null, readonly expression: WExpression, readonly expression2: WExpression | undefined};
}

function encodeBlockType(t: ValueType | null): byte[] {
    if (t === null) return [0x40 as byte];
    return [t];
}

export function blockLoopInstr(opcode: number, name: "block" | "loop"): (type: ValueType | null, body: (PartialInstr | InstrInstance)[], contextFn?: InstrContext<void>) => InstrContext<BlockLoopInstance> {
    const constructor = (type: ValueType | null, body: (PartialInstr | InstrInstance)[], contextFn?: InstrContext<void>) => (context: Context) => {
        if (contextFn) contextFn(context); // used to store depth

        const instr: BlockLoopInstance = {
            name, type: "structured",
            parameters: [], result: type,

            get encoded() {
                return [opcode as byte, ...encodeBlockType(type), ...expression.encoded];
            },
            get immediate() {
                return {type, expression, expression2: undefined};
            },
            get reads() {
                return expression.reads;
            },
            get writes() {
                return expression.writes;
            },

            copy() {
                return (ctx) => {
                    const x = constructor(type, [])(ctx);
                    expression.copyInto(x.immediate.expression);
                    return x;
                };
            }
        };
        const expression = new WExpression(instr, context.depth + 1, context.builder);
        expression.push(...body);
        return instr;
    };

    return constructor;
}

export function ifInstr(opcode: number, elseOpcode: number): (type: ValueType | null, body: (PartialInstr | InstrInstance)[], elseBody?: (PartialInstr | InstrInstance)[], contextFn?: InstrContext<void>) => InstrContext<IfInstance> {
    const constructor = (type: ValueType | null, body: (PartialInstr | InstrInstance)[], elseBody?: (PartialInstr | InstrInstance)[], contextFn?: InstrContext<void>) => (context: Context) => {
        if (contextFn) contextFn(context); // used to store depth

        const instr: IfInstance = {
            name: "if", type: "structured",
            parameters: [i32Type], result: type,

            get encoded() {
                const instr = [opcode as byte, ...encodeBlockType(type), ...expression.encoded];
                if (expression2) {
                    instr.pop(); // replace 0x0B marking end of expression1 with 0x05 for else
                    instr.push(elseOpcode as byte, ...expression2.encoded);
                }
                return instr;
            },
            get immediate() {
                return {type, expression, expression2};
            },
            get reads() {
                if (expression2) {
                    return [...new Set([...expression.reads, ...expression2.reads])];
                }
                return expression.reads;
            },
            get writes() {
                if (expression2) {
                    return [...new Set([...expression.writes, ...expression2.writes])];
                }
                return expression.writes;
            },

            copy() {
                return (ctx) => {
                    const x = constructor(type, [], expression2 ? [] : undefined)(ctx);
                    expression.copyInto(x.immediate.expression);
                    if (expression2) expression2.copyInto(x.immediate.expression2 as WExpression);
                    return x;
                };
            }
        };

        const expression = new WExpression(instr, context.depth + 1, context.builder);
        expression.push(...body);
        let expression2: WExpression | undefined;
        if (elseBody) {
            expression2 = new WExpression(instr, context.depth + 1, context.builder);
            expression2.push(...elseBody);
        }
        return instr;
    };

    return constructor;
}


// Expressions
export class WExpression {
    private _stack: ValueType[] = [];
    private _instructions: InstrInstance[] = [];

    constructor(readonly parent: StructureInstance | null, readonly depth: number, readonly builder: WFunctionBuilder) {
    }

    push(...items: (PartialInstr | InstrInstance)[]): void {
        for (const instrFn of items) {
            this._instructions.push(this.createInstr(instrFn, this._stack));
        }
    }

    get(index: number): InstrInstance {
        if (index < 0) index += this.instructions.length;
        return this._instructions[index];
    }

    pop(): InstrInstance | undefined {
        const instr = this._instructions.pop();
        if (!instr) return undefined;

        if (instr.result) this._stack.pop();
        this._stack.push(...instr.parameters);
        return instr;
    }

    replace(start: number, end: number, ...items: (PartialInstr | InstrInstance)[]): void {
        if (start < 0 || end < start || start > this._instructions.length) {
            throw new Error("Invalid replacement indices");
        }

        // stack and instructions before
        const stack: ValueType[] = []; // new instructions going at start of expression, so stack will be empty
        const instructions: InstrInstance[] = this._instructions.slice(0, start);
        instructions.forEach(x => this.stackManipulation(x, stack));

        // new instructions
        items.forEach(newInstr => instructions.push(this.createInstr(newInstr, stack)));

        // instructions after
        try {
            for (let i = end, instr; i < this._instructions.length; i++) {
                this.stackManipulation(instr = this._instructions[i], stack);
                instructions.push(instr);
            }

            // check stack the same
            if (this._stack.length !== stack.length || this._stack.some((v, i) => v !== stack[i])) {
                throw new Error("Stack different");
            }

            this._instructions = instructions;
        } catch (e) {
            throw new Error(`Invalid replacement due to: \n\n${e.stack}\n`);
        }
    }

    copyInto(target: WExpression): void {
        for (const instr of this.instructions) target.push(instr.copy());
    }

    *instructionsRecursive(): IterableIterator<InstrInstance> {
        for (const instr of this.instructions) {
            yield instr;
            if (instr.type === "structured") {
                yield* instr.immediate.expression.instructionsRecursive();
                if (instr.immediate.expression2) yield* instr.immediate.expression2.instructionsRecursive();
            }
        }
    }

    private stackManipulation(instr: InstrInstance, stack: ValueType[]) {
        // check stack parameters
        for (let i = instr.parameters.length - 1; i >= 0; i--) {
            if (instr.parameters[i] !== stack.pop()) {
                throw new Error(`Stack does not match Wasm instruction (${instr.name}) parameters\nPrevious instructions: ${this._instructions.map(x => x.name).reverse().join(", ")}`);
            }
        }
        // push result if any
        if (instr.result) stack.push(instr.result);
    }

    private createInstr(instr: PartialInstr | InstrInstance, stack: ValueType[]): InstrInstance {
        if (typeof instr === "function") {
            // PartialInstr - get instance of the instruction
            instr = instr({
                depth: this.depth,
                builder: this.builder,
                stack
            });
        }
        this.stackManipulation(instr, stack);
        return instr;
    }

    get instructions(): ReadonlyArray<InstrInstance> {
        return this._instructions;
    }

    get stack(): ReadonlyArray<ValueType> {
        return this._stack;
    }

    get encoded(): byte[] {
        const encoded = this._instructions.flatMap(x => x.encoded);
        encoded.push(0x0B as byte);
        return encoded;
    }

    get reads(): ReadonlyArray<ReadResource> {
        const reads = this._instructions.flatMap(x => x.reads);
        return [...new Set(reads)];
    }

    get writes(): ReadonlyArray<WriteResource> {
        const writes = this._instructions.flatMap(x => x.writes);
        return [...new Set(writes)];
    }
}

import {byte} from "./base_types";
import {encodeU32} from "./encoding";
import {WFunctionBuilder, WLocal} from "./functions";
import {WGlobal} from "./global";
import {ValueType, i32Type} from "./wtypes";

type ReadResource = "memory" | WLocal | WGlobal;
type WriteResource = "functionCall" | "arbitrary" | ReadResource;

type Context = {
    parent: StructureInstance | null,
    depth: number;
    builder: WFunctionBuilder,
    stack: ReadonlyArray<ValueType>;
};
type InstrContext<T> = (c: Context) => T;
export type PartialInstr = InstrContext<InstrInstance>;

export interface BaseInstance {
    readonly name: string;
    readonly type: string;
    readonly args: object;
    readonly parent: StructureInstance | null;

    /* Instruction as bytes */
    encoded: ReadonlyArray<byte>;
    /* Values consumed from stack, parameters[n-1] being top of the stack */
    readonly parameters: ReadonlyArray<ValueType>;
    /* Value pushed onto stack if any */
    readonly result: ValueType | null;

    readonly reads: ReadonlyArray<ReadResource>;
    /* Resource written to */
    readonly writes: ReadonlyArray<WriteResource>;
}

export type InstrInstance = ZeroArgInstance | ConstantInstance<bigint | number> | MemInstance | IdxInstance | StructureInstance;

// Zero argument instructions
interface ZeroArgInstance extends BaseInstance {
    type: "zeroArg";
    args: {};
}

export function zeroArgs(name: string, opcode: number[], parameters: ReadonlyArray<ValueType>, result: ValueType | null,
                         reads: ReadResource[] = [], writes: WriteResource[] = []): () => InstrContext<ZeroArgInstance> {
    const instr: Omit<ZeroArgInstance, "parent"> = {
        name,
        type: "zeroArg", args: {},
        encoded: opcode as byte[],
        parameters, result,
        reads, writes
    };
    return () => ({parent}) => Object.setPrototypeOf({parent}, instr);
}

type DataFlow = {parameters: ValueType[], result: ValueType | null, reads: ReadResource[], writes: WriteResource[]};
export function zeroArgsSpecial(name: string, opcode: number[], specialFn: InstrContext<DataFlow>): () => InstrContext<ZeroArgInstance> {
    return () => (context) => {
        const {parameters, result, reads, writes} = specialFn(context);
        return {
            name, parent: context.parent,
            type: "zeroArg", args: {},
            encoded: opcode as byte[],
            parameters, result,
            reads, writes
        };
    };
}

// Arithmetic constant instructions
interface ConstantInstance<T extends bigint | number> extends BaseInstance {
    type: "constant";
    args: {value: T};
}

export function constantArg<T extends bigint | number>(name: string, opcode: number[],
                                                       encodeFn: (x: T) => byte[],
                                                       result: ValueType | null): (x: T) => InstrContext<ConstantInstance<T>> {
    return (value) => ({parent}) => ({
        name, parent,
        type: "constant", args: {value},
        encoded: [...opcode as byte[], ...encodeFn(value)],
        parameters: [], result,
        reads: [], writes: []
    });
}

// Memory argument instructions
interface MemInstance extends BaseInstance {
    type: "memory";
    args: {align: bigint, offset: bigint};
}

export function memArg(name: string, opcode: number[],
                       type: "load" | "store", valueType: ValueType): (align: number | bigint, offset: number | bigint) => InstrContext<MemInstance> {
    return (align, offset) => {
        if (typeof align === "number") align = BigInt(align);
        if (typeof offset === "number") offset = BigInt(offset);
        const encoded = [...opcode as byte[], ...encodeU32(align), ...encodeU32(offset)];
        const args = {align, offset};

        return ({parent}) => ({
            name, parent, encoded,
            type: "memory", args: args,
            parameters: type === "load" ? [i32Type] : [i32Type, valueType],
            result: type === "load" ? valueType : null,
            reads: type === "load" ? ["memory"] : [],
            writes: type === "load" ? [] : ["memory"],
        });
    };
}

// Index argument instructions

// either an index (instance of T), an object with a getter for the index
// or a plain number to make the api easier to use
type Index<T extends bigint> = number | T | {getIndex(depth: number): T};
interface IdxInstance extends BaseInstance {
    type: "index";
    args: {value: bigint};
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

type IndexFn<T extends bigint> = (c: Context & {value: T}) => DataFlow;
export function idxArg<T extends bigint>(name: string, opcode: number[], suffix: number[],
                                         stackOps: IndexFn<T>): (x: Index<T>) => InstrContext<IdxInstance> {
    return (x) => context => {
        const value = getIndex(x, context.depth);
        const encoded = [...opcode as byte[], ...encodeU32(value), ...suffix as byte[]];
        const {parameters, result, reads, writes} = stackOps({value, ...context});

        return {
            name, encoded,
            parent: context.parent, type: "index", args: {value},
            parameters, result,
            reads, writes
        };
    };
}

// Structured instructions
type StructureInstance = BlockLoopInstance | IfInstance;
interface BlockLoopInstance extends BaseInstance {
    type: "structured";
    name: "block" | "loop";
    args: {type: ValueType | null, expression: WExpression, expression2: undefined};
}

interface IfInstance extends BaseInstance {
    type: "structured";
    name: "if";
    args: {type: ValueType | null, expression: WExpression, expression2: WExpression | undefined};
}

function encodeBlockType(t: ValueType | null): byte[] {
    if (t === null) return [0x40 as byte];
    return [t];
}

export function blockLoopInstr(opcode: number, name: "block" | "loop"): (type: ValueType | null, body: PartialInstr[], contextFn?: InstrContext<void>) => InstrContext<BlockLoopInstance> {
    return (type, body, contextFn) => (context) => {
        if (contextFn) contextFn(context); // used to store depth

        const instr: BlockLoopInstance = {
            name,
            parent: context.parent,
            type: "structured",
            parameters: [], result: type,

            get encoded() {
                return [opcode as byte, ...encodeBlockType(type), ...expression.encoded];
            },
            get args() {
                return {type, expression, expression2: undefined};
            },
            get reads() {
                return expression.reads;
            },
            get writes() {
                return expression.writes;
            }
        };
        const expression = new WExpression(instr, context.depth + 1, context.builder);
        expression.push(...body);
        return instr;
    };
}

export function ifInstr(opcode: number, elseOpcode: number): (type: ValueType | null, body: PartialInstr[], elseBody?: PartialInstr[], contextFn?: InstrContext<void>) => InstrContext<IfInstance> {
    return (type, body, elseBody, contextFn) => (context) => {
        if (contextFn) contextFn(context); // used to store depth

        const instr: IfInstance = {
            name: "if", type: "structured", parent: context.parent,
            parameters: [], result: type,

            get encoded() {
                const instr = [opcode as byte, ...encodeBlockType(type), ...expression.encoded];
                if (expression2) {
                    instr.pop(); // replace 0x0B marking end of expression1 with 0x05 for else
                    instr.push(elseOpcode as byte, ...expression2.encoded);
                }
                return instr;
            },
            get args() {
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
}


// Expressions
export class WExpression {
    private _stack: ValueType[] = [];
    private _instructions: InstrInstance[] = [];

    constructor(private readonly parent: StructureInstance | null, readonly depth: number, readonly builder: WFunctionBuilder) {
    }

    push(...items: PartialInstr[]): void {
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

    unshift(...items: PartialInstr[]): void {
        const stack: ValueType[] = []; // new instructions going at start of expression, so stack will be empty
        const instr: InstrInstance[] = [];
        for (const instrFn of items) {
            instr.push(this.createInstr(instrFn, stack));
        }
        this._instructions.unshift(...instr);
        this._stack.unshift(...stack);
    }

    replace(start: number, end: number, ...items: PartialInstr[]): void {
        if (start < 0 || end < start || start >= this._instructions.length) {
            throw new Error("Invalid replacement indices");
        }

        // stack and instructions before
        const stack: ValueType[] = []; // new instructions going at start of expression, so stack will be empty
        const instructions: InstrInstance[] = this._instructions.slice(0, start);
        instructions.forEach(x => this.stackManipulation(stack, x));

        // new instructions
        for (const newInstr of items) instructions.push(this.createInstr(newInstr, stack));

        // instructions after
        try {
            for (let i = end, instr; i < this._instructions.length; i++) {
                this.stackManipulation(stack, instr = this._instructions[i]);
                instructions.push(instr);
            }

            // check stack the same
            if (this._stack.length !== stack.length || this._stack.some((v, i) => v !== stack[i])) {
                throw new Error("Stack different");
            }

            this._instructions = instructions;
        } catch (e) {
            throw new Error("Invalid replacement due to: \n" + e.stack);
        }
    }

    private stackManipulation(stack: ValueType[], instr: InstrInstance) {
        // check stack parameters
        for (let i = instr.parameters.length - 1; i >= 0; i--) {
            if (instr.parameters[i] !== stack.pop()) {
                throw new Error(`Stack does not match Wasm instruction (${instr.name}) parameters\nPrevious instructions: ${this._instructions.map(x => x.name).reverse().join(", ")}`);
            }
        }
        // push result if any
        if (instr.result) stack.push(instr.result);
    }

    private createInstr(instrFn: PartialInstr, stack: ValueType[]): InstrInstance {
        // get instance of the instruction
        const instr = instrFn({
            parent: this.parent,
            depth: this.depth,
            builder: this.builder,
            stack
        });
        this.stackManipulation(stack, instr);
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

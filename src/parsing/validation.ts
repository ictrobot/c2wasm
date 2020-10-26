import {ParseNode} from "./parsetree";
import * as pt from "./parsetree";

const validatorMap = new Map<typeof ParseNode, ((node: ParseNode, parents: ParseNode[]) => void)[]>();

export function validate<T extends Iterable<ParseNode>>(nodeList: T, parents: ParseNode[] = []): T {
    for (const node of nodeList) {
        parents.push(node);
        validate(node.children(), parents);
        parents.pop();

        for (const validator of validatorMap.get(Object.getPrototypeOf(node).constructor) ?? []) {
            validator(node, parents);
        }
    }
    return nodeList;
}

export class ParseTreeValidationError extends Error {
    constructor(readonly node: ParseNode | undefined, message: string) {
        super(message);
    }
}

function validator<T extends ParseNode>(type: { new(...args: any[]): T}, fn: (node: T, parents: ParseNode[]) => void) {
    const validators = validatorMap.get(type);
    if (validators) {
        validators.push(fn as any);
    } else {
        validatorMap.set(type, [fn as any]);
    }
}

// Begin validators

// test
validator(pt.Identifier, d => console.log(`Identifier found ${d.name}`));

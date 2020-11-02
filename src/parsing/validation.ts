import {CError} from "../c_error";
import {getArithmeticType} from "../tree/types";
import * as pt from "./parsetree";
import {ParseNode, TypeSpecifier} from "./parsetree";

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

export class ParseTreeValidationError extends CError {
    readonly name = "TreeValidationError";

    constructor(node: ParseNode | undefined, message: string) {
        super(node && node.loc ? `Line ${node.loc.first_line + 1}: ${message}` : message, node);
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

// DeclarationSpecifiers/SpecifierQualifiers validation
function typeLookup(specifierList: ReadonlyArray<pt.TypeSpecifier>, node?: ParseNode) {
    if (specifierList.every(v => typeof v === 'string')) {
        if (!getArithmeticType(specifierList as ReadonlyArray<TypeSpecifier & string>)) {
            throw new ParseTreeValidationError(node, "Invalid specifiers - " + specifierList.join(", "));
        }
    }
}

const typeValidation = (d: pt.SpecifierQualifiers | pt.DeclarationSpecifiers) => {
    if (d.qualifierList.length > 1) throw new ParseTreeValidationError(d, "Invalid qualifiers.");
    typeLookup(d.specifierList, d);
};

validator(pt.SpecifierQualifiers, typeValidation);
validator(pt.DeclarationSpecifiers, typeValidation);
validator(pt.DeclarationSpecifiers, d => {
    if (d.storageList.length > 1) throw new ParseTreeValidationError(d, "Invalid storage class list.");
});

// Constant expr validation
function constExprValidation(n: ParseNode, parents: ParseNode[]) {
    for (let i = parents.length - 1; i >= 0; i--) {
        if (!(parents[i] instanceof pt.Expression) || parents[i].type === "sizeof") return;
        if (parents[i].type === "constantExpr") throw new ParseTreeValidationError(n, "Invalid constant expr.");
    }
}

validator(pt.UnaryExpression, (node, parent) => {
    switch (node.type) {
    case "postfixIncrement":
    case "postfixDecrement":
    case "prefixIncrement":
    case "prefixDecrement":
    case "addressOf": // If integers are required (believe this is always the case?)
    case "dereference":
        constExprValidation(node, parent);
    }
});
validator(pt.BinaryExpression, (node, parent) => {
    switch (node.type) {
    case "comma":
    case "arraySubscript": // If int
        constExprValidation(node, parent);
    }
});
validator(pt.FunctionCallExpression, constExprValidation);

// If int
validator(pt.MemberAccessExpression, constExprValidation);

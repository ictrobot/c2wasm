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
    readonly name = "TreeValidationError";

    constructor(readonly node: ParseNode | undefined, message: string) {
        super(node && node.loc ? `Line ${node.loc.first_line + 1}: ${message}` : message);
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
    const copy = specifierList.slice();

    function check(s: pt.TypeSpecifier) {
        for (let i = 0; i < copy.length; i++) {
            if (copy[i] === s) {
                copy.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    function combinations() {
        if (check("double")) {
            check("long");
            return "fp64";
        } else if (check("float")) {
            return "fp32";
        } else if (check("char")) {
            if (check("signed")) return "s8";
            check("unsigned");
            return "u8";
        } else if (check("short")) {
            check("int");
            if (check("unsigned")) return "u16";
            check("signed");
            return "s16";
        } else if (check("long")) {
            check("long");
            check("int");
            if (check("unsigned")) return "u64";
            check("signed");
            return "s64";
        } else if (check("int")) {
            if (check("unsigned")) return "u32";
            check("signed");
            return "s32";
        }
    }

    const type = combinations();
    if (copy.length === 0 && type) return type;
    throw new ParseTreeValidationError(node, "Invalid specifiers - " + specifierList.join(", "));
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

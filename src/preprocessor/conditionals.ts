import {parse} from "../parsing";
import {Expression, Constant, BinaryExpression, UnaryExpression, Identifier} from "../parsing/parsetree";
import {ptConstant} from "../tree/transform/expr_transform";
import {Preprocessor} from "./preprocessor";

export function ppEvaluate(x: string, preprocessor: Preprocessor): bigint {
    const parseTree = parse(`int x = ${x};`);
    if (parseTree.length !== 1 || parseTree[0].type !== "declaration" || parseTree[0].list.length !== 1 || parseTree[0].list[0].type !== "initDeclarator" || Array.isArray(parseTree[0].list[0].initializer)) {
        throw preprocessor.error("Invalid #if conditional: `" + x + "`");
    }
    const expression = parseTree[0].list[0].initializer as Expression;
    return _eval(expression, preprocessor);
}

function _eval(n: Expression, preprocessor: Preprocessor): bigint {
    if (n instanceof Constant && n.valueType !== "float") {
        return BigInt(ptConstant(n).value);
    } else if (n instanceof BinaryExpression) {
        switch (n.type) {
        case "add":
            return _eval(n.lhs, preprocessor) + _eval(n.rhs, preprocessor);
        case "sub":
            return _eval(n.lhs, preprocessor) - _eval(n.rhs, preprocessor);
        case "mul":
            return _eval(n.lhs, preprocessor) * _eval(n.rhs, preprocessor);
        case "div":
            return _eval(n.lhs, preprocessor) / _eval(n.rhs, preprocessor);
        case "bitwiseAnd":
            return _eval(n.lhs, preprocessor) & _eval(n.rhs, preprocessor);
        case "bitwiseOr":
            return _eval(n.lhs, preprocessor) | _eval(n.rhs, preprocessor);
        case "bitwiseXor":
            return _eval(n.lhs, preprocessor) ^ _eval(n.rhs, preprocessor);
        case "bitwiseShiftLeft":
            return _eval(n.lhs, preprocessor) << _eval(n.rhs, preprocessor);
        case "bitwiseShiftRight":
            return _eval(n.lhs, preprocessor) >> _eval(n.rhs, preprocessor);
        case "relationalEq":
            return _eval(n.lhs, preprocessor) === _eval(n.rhs, preprocessor) ? 1n : 0n;
        case "relationalNEq":
            return _eval(n.lhs, preprocessor) !== _eval(n.rhs, preprocessor) ? 1n : 0n;
        case "relationalLT":
            return _eval(n.lhs, preprocessor) < _eval(n.rhs, preprocessor) ? 1n : 0n;
        case "relationalLEq":
            return _eval(n.lhs, preprocessor) <= _eval(n.rhs, preprocessor) ? 1n : 0n;
        case "relationalGT":
            return _eval(n.lhs, preprocessor) > _eval(n.rhs, preprocessor) ? 1n : 0n;
        case "relationalGEq":
            return _eval(n.lhs, preprocessor) >= _eval(n.rhs, preprocessor) ? 1n : 0n;
        case "logicalAnd":
            return (_eval(n.lhs, preprocessor) !== 0n && _eval(n.rhs, preprocessor) !== 0n) ? 1n : 0n;
        case "logicalOr":
            return (_eval(n.lhs, preprocessor) !== 0n || _eval(n.rhs, preprocessor) !== 0n) ? 1n : 0n;
        }
    } else if (n instanceof UnaryExpression) {
        switch (n.type) {
        case "unaryPlus":
            return _eval(n.body, preprocessor);
        case "unaryMinus":
            return -(_eval(n.body, preprocessor));
        case "logicalNot":
            return _eval(n.body, preprocessor) === 0n ? 1n : 0n;
        }
    } else if (n instanceof Identifier) {
        return 0n;
    }

    throw preprocessor.error("Invalid preprocessor expression");
}

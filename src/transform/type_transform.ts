import {Scope} from "../ir/scope";
import {CType, getArithmeticType, CPointer, addQualifier, CFuncType, CNotFuncType, CVoid} from "../ir/types";
import * as pt from "../parsing/parsetree";
import {ParseTreeValidationError} from "../parsing/validation";

type GeneralTypeDecl = {
    typeInfo: pt.SpecifierQualifiers | pt.DeclarationSpecifiers,
    declarator?: pt.Declarator | pt.AbstractDeclarator
};

/** helper function for specifier & declarator type */
export function getType(o: GeneralTypeDecl, scope: Scope): CType {
    let type = getSpecifierType(o.typeInfo, scope);
    if (o.declarator) type = getDeclaratorType(type, o.declarator, scope);
    return type;
}

export function getDeclaratorType(type: CType, declarator: pt.Declarator | pt.AbstractDeclarator, scope: Scope): CType {
    let d: pt.Declarator | pt.AbstractDeclarator | undefined = declarator;

    while (d && !(d instanceof pt.IdentifierDeclarator)) {
        if (d instanceof pt.PointerDeclarator || d instanceof pt.AbstractPointerDeclarator) {
            let ptr: pt.Pointer | undefined = d.pointer;
            while (ptr) {
                type = new CPointer(type, ptr.qualifierList?.includes("const"));
                ptr = ptr.body;
            }
            d = d.body;

        } else if (d instanceof pt.ArrayDeclarator || d instanceof pt.AbstractArrayDeclarator) {
            // need to support evaluating the constant expression to a number
            // and getting the length from the initializer
            throw new ParseTreeValidationError(declarator, "Not implemented"); // TODO

        } else { // d instanceof pt.(Abstract)FunctionDeclarator
            const parameterTypes = [];
            let parameterNames = undefined;

            for (const param of d.args ?? []) {
                let type = getSpecifierType(param.typeInfo, scope);
                if (param.declarator) type = getDeclaratorType(type, param.declarator, scope);
                if (param.typeInfo.qualifierList.length) type = addQualifier(type, param.typeInfo.qualifierList[0]);
                if (type instanceof CFuncType) {
                    throw new ParseTreeValidationError(param, "Functions cannot be parameters");
                }
                parameterTypes.push(type);

                if (param.declarator && !param.declarator.abstractDeclarator) {
                    parameterNames ??= [];
                    parameterNames.push(getDeclaratorName(param.declarator));
                }

                if (parameterNames && parameterNames.length !== parameterTypes.length) {
                    throw new ParseTreeValidationError(param, "Unexpected mix of abstract & non-abstract declarators");
                }
            }

            if (parameterTypes.length === 0) {
                // ensure parameterNames are always non-null in function definitions
                parameterNames = [];
            }

            if (d.body && !(d.body instanceof pt.IdentifierDeclarator)) {
                throw new ParseTreeValidationError(d.body, "Unexpected declarator");
            }
            return new CFuncType(type as CNotFuncType, parameterTypes, parameterNames);
        }
    }
    return type;
}

export function getDeclaratorName(declarator: pt.Declarator | pt.InitDeclarator): string {
    while (!(declarator instanceof pt.IdentifierDeclarator)) {
        declarator = declarator.body;
    }
    return declarator.id;
}

export function getSpecifierType(d: pt.SpecifierQualifiers | pt.DeclarationSpecifiers, scope: Scope): CType {
    const specifiers = d.specifierList;
    if (specifiers.every(x => typeof x === 'string')) {
        // basic type
        const type = getArithmeticType(specifiers as ReadonlyArray<pt.TypeSpecifier & string>);
        if (type) return type;
        throw new ParseTreeValidationError(d, "Invalid arithmetic type");
    }

    // support struct, union, enum
    throw new ParseTreeValidationError(d, "Not implemented"); // TODO
}

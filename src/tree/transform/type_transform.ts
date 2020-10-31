import {CVariable} from "../declarations";
import {CExpression, CInitializer} from "../expressions";
import {Scope} from "../scope";
import {CType, getArithmeticType, CPointer, addQualifier, CFuncType, CNotFuncType, CArray, CEnum, CStruct, CUnion} from "../types";
import {ParseTreeValidationError, pt} from "../../parsing/";
import {evalConstant} from "./expr_transform";

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

export function getDeclaratorType(type: CType,
                                  declarator: pt.Declarator | pt.AbstractDeclarator,
                                  scope: Scope,
                                  initialValue?: CExpression | CInitializer): CType {

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
            type = new CArray(type);
            if (d.length) {
                type.length = Number(evalConstant(d.length).value);
            } else if (initialValue && initialValue.type instanceof CArray) {
                type.length = initialValue.type.length;
            }

            d = d.body;
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
    const singleSpecifier = specifiers.length === 1 ? specifiers[0] : undefined;
    if (singleSpecifier instanceof pt.StructUnionSpecifier) {
        const type = singleSpecifier.structure === "struct" ? CStruct : CUnion;
        const structure = new type(singleSpecifier.id);
        if (!singleSpecifier.declarations) return structure;
        if (singleSpecifier.id) scope.addTag(structure);

        const values = [];
        for (const declaration of singleSpecifier.declarations) {
            const baseType = getSpecifierType(declaration.typeInfo, scope);
            for (const declarator of declaration.list) {
                const type = addQualifier(getDeclaratorType(baseType, declarator, scope), declaration.typeInfo.qualifierList[0]);
                const name = getDeclaratorName(declarator);
                if (type.incomplete || type.bytes === 0) {
                    throw new ParseTreeValidationError(declarator, "Type must be complete");
                }
                values.push(new CVariable(name, type as CNotFuncType));
            }
        }
        structure.members = values;
        return structure;
    } else if (singleSpecifier instanceof pt.EnumSpecifier) {
        const cEnum = new CEnum(singleSpecifier.id);
        if (!singleSpecifier.body) return cEnum;
        if (singleSpecifier.id) scope.addTag(cEnum);

        let nextValue = 0;
        const values = [];
        for (const e of singleSpecifier.body) {
            // TODO actually make enum constants accessible (as ints or their own type?)

            if (e.value) nextValue = Number(evalConstant(e.value).value);
            values.push({name: e.id, value: nextValue++});
        }
        cEnum.values = values;
        return cEnum;
    } else if (specifiers.every(x => typeof x === 'string')) {
        // arithmetic or void
        const type = getArithmeticType(specifiers as ReadonlyArray<pt.TypeSpecifier & string>);
        if (type) return type;
    } else if (specifiers.find(x => x instanceof pt.CustomTypeSpecifier)) {
        throw new ParseTreeValidationError(d, "Not implemented"); // TODO
    }

    throw new ParseTreeValidationError(d, "Invalid specifier");
}

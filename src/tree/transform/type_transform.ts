import {CVariable} from "../declarations";
import {CConstant} from "../expressions";
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
    if (o.typeInfo.qualifierList.length) type = addQualifier(type, o.typeInfo.qualifierList[0]);
    if (o.declarator) type = getDeclaratorType(type, o.declarator, scope);
    return type;
}

export function getDeclaratorType(type: CType, declarator: pt.Declarator | pt.AbstractDeclarator, scope: Scope): CType {
    let d: pt.Declarator | pt.AbstractDeclarator | undefined = declarator;

    while (d && !(d instanceof pt.IdentifierDeclarator)) {
        if (d instanceof pt.PointerDeclarator || d instanceof pt.AbstractPointerDeclarator) {
            let ptr: pt.Pointer | undefined = d.pointer;
            while (ptr) {
                type = new CPointer(ptr, type, ptr.qualifierList?.includes("const"));
                ptr = ptr.body;
            }
            d = d.body;

        } else if (d instanceof pt.ArrayDeclarator || d instanceof pt.AbstractArrayDeclarator) {
            type = new CArray(d, type);
            if (d.length) {
                type.length = Number(evalConstant(d.length).value);
                if (type.length <= 0) throw new ParseTreeValidationError(d.length, "Invalid array length");
            }

            d = d.body;
        } else { // d instanceof pt.(Abstract)FunctionDeclarator
            const parameterTypes = [];
            let parameterNames = undefined;

            for (const param of d.args ?? []) {
                const type = getType(param, scope);
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
            return new CFuncType(d, type as CNotFuncType, parameterTypes, parameterNames);
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

function getSpecifierType(d: pt.SpecifierQualifiers | pt.DeclarationSpecifiers, scope: Scope): CType {
    const specifiers = d.specifierList;
    const singleSpecifier = specifiers.length === 1 ? specifiers[0] : undefined;

    if (singleSpecifier instanceof pt.StructUnionSpecifier) {
        const type = singleSpecifier.structure === "struct" ? CStruct : CUnion;
        let structure = new type(singleSpecifier, singleSpecifier.id);
        if (singleSpecifier.id) {
            // lookup tag and if it already exists use its instance
            const existing: CStruct | CUnion = scope.lookupTag(singleSpecifier.id, type as any, singleSpecifier) as any;
            if (existing) {
                structure = existing;
            } else {
                scope.addTag(structure);
            }
        }
        if (!singleSpecifier.declarations) return structure;

        const values = [];
        for (const declaration of singleSpecifier.declarations) {
            const baseType = getType(declaration, scope);
            for (const declarator of declaration.list) {
                const type = getDeclaratorType(baseType, declarator, scope);
                const name = getDeclaratorName(declarator);
                if (type.incomplete || type.bytes === 0) {
                    throw new ParseTreeValidationError(declarator, "Type must be complete");
                }
                values.push(new CVariable(declaration, name, type as CNotFuncType));
            }
        }
        structure.members = values;
        structure.node = singleSpecifier;
        return structure;

    } else if (singleSpecifier instanceof pt.EnumSpecifier) {
        let cEnum = new CEnum(singleSpecifier, singleSpecifier.id);
        if (singleSpecifier.id) {
            // lookup tag and if it already exists use its instance
            const existing = scope.lookupTag(singleSpecifier.id, CEnum, singleSpecifier);
            if (existing) {
                cEnum = existing;
            } else {
                scope.addTag(cEnum);
            }
        }
        if (!singleSpecifier.body) return cEnum;

        let nextValue = 0;
        const values = [];
        for (const e of singleSpecifier.body) {
            if (e.value) nextValue = Number(evalConstant(e.value).value);

            const enumConstant = new CVariable(e, e.id, addQualifier(cEnum, "const"), scope.isTop ? undefined : "static");
            enumConstant.staticValue = new CConstant(e, cEnum, nextValue);
            scope.addIdentifier(enumConstant);

            values.push({name: e.id, value: nextValue++});
        }
        cEnum.values = values;
        cEnum.node = singleSpecifier;
        return cEnum;

    } else if (specifiers.every(x => typeof x === 'string')) {
        // arithmetic or void
        const type = getArithmeticType(specifiers as ReadonlyArray<pt.TypeSpecifier & string>);
        if (type) return type;

    } else if (specifiers.find(x => x instanceof pt.CustomTypeSpecifier)) {
        throw new ParseTreeValidationError(d, "Not implemented"); // TODO implement custom types
    }

    throw new ParseTreeValidationError(d, "Invalid specifier");
}
import {CVarDefinition} from "../declarations";
import {CConstant} from "../expressions";
import {Scope} from "../scope";
import {CType, getArithmeticType, CPointer, addQualifier, CFuncType, CNotFuncType, CArray, CEnum, CStruct, CUnion, CCompoundMember, CVoid, CArithmetic} from "../types";
import {ParseTreeValidationError, pt} from "../../parsing/";
import {evalIntegerConstant} from "./expr_transform";

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

/** transform the CType from a type specifier into the declarator type */
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
                type.length = Number(evalIntegerConstant(d.length, scope).value);
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

            if (parameterTypes.length === 1 && parameterTypes[0] instanceof CVoid) parameterTypes.shift();

            if (parameterTypes.length === 0) {
                // ensure parameterNames are always non-null in function definitions
                parameterNames = [];
            }

            type = new CFuncType(d, type as CNotFuncType, parameterTypes, parameterNames, d.variadic);
            d = d.body;
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

/** Get the base type from the list of specifiers */
function getSpecifierType(d: pt.SpecifierQualifiers | pt.DeclarationSpecifiers, scope: Scope): CType {
    const specifiers = d.specifierList;
    const singleSpecifier = specifiers.length === 1 ? specifiers[0] : undefined;

    if (singleSpecifier instanceof pt.StructUnionSpecifier) {
        const type = singleSpecifier.structure === "struct" ? CStruct : CUnion;
        let structure = new type(singleSpecifier, singleSpecifier.id);
        if (singleSpecifier.id) {
            // lookup tag and if it already exists use the existing instance
            const existing: CStruct | CUnion = scope.lookupTag(singleSpecifier.id, type as any, singleSpecifier) as any;
            if (existing) {
                structure = existing;
            } else {
                scope.addTag(structure);
            }
        }
        if (!singleSpecifier.declarations) return structure;

        const values: CCompoundMember[] = []; // populate struct/union members if provided
        for (const declaration of singleSpecifier.declarations) {
            const baseType = getType(declaration, scope);

            for (const declarator of declaration.list) {
                const type = getDeclaratorType(baseType, declarator, scope);
                const name = getDeclaratorName(declarator);
                if (type.incomplete || type.bytes === 0 || type instanceof CFuncType) {
                    throw new ParseTreeValidationError(declarator, "Type must be complete");
                }

                values.push(new CCompoundMember(declaration, name, type));
            }
        }
        structure.members = values;
        structure.node = singleSpecifier; // set the parse node to point to the node which actually defined the members
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
        if (!singleSpecifier.body) return CArithmetic.S32;

        // enum members either provide their own value or use the last value + 1, starting at 0
        let nextValue = 0n;
        const values = [];
        for (const e of singleSpecifier.body) { // populate enum
            if (e.value) nextValue = evalIntegerConstant(e.value, scope).value;

            // enum constants are `int`s!!!
            const enumConstant = new CVarDefinition(e, e.id, addQualifier(CArithmetic.S32, "const"), "static", "internal");
            enumConstant.staticValue = new CConstant(e, CArithmetic.S32, nextValue);

            scope.addIdentifier(enumConstant); // add the enum member as a constant to the scope
            values.push({name: e.id, value: nextValue++});
        }
        cEnum.values = values;
        cEnum.node = singleSpecifier;
        return CArithmetic.S32;

    } else if (specifiers.every(x => typeof x === 'string')) {
        // arithmetic or void
        const type = getArithmeticType(specifiers as ReadonlyArray<pt.TypeSpecifier & string>);
        if (type) return type;

    } else if (specifiers.length === 1 && specifiers[0] instanceof pt.CustomTypeSpecifier) {
        // typedef
        return scope.lookupTypedef(specifiers[0].name);
    }

    throw new ParseTreeValidationError(d, "Invalid specifier");
}

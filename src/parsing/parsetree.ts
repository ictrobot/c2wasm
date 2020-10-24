export type Location = {first_line: number, last_line: number, first_column: number, last_column: number};

abstract class ParseNode {
    abstract readonly type: string;

    constructor(public loc: Location) {
    }
}

// Expressions

export class Expression extends ParseNode {
    readonly type = "expression";
}

export class ConstantExpression extends Expression {
    private readonly _constant: boolean = true;
}

export class Identifier extends ConstantExpression {
    readonly op = "identifier";

    constructor(loc: Location, public name: string) {
        super(loc);
    }
}

export class Constant extends ConstantExpression {
    readonly op = "constant";

    constructor(loc: Location, public value: string) {
        super(loc);
    }
}

export class StringLiteral extends ConstantExpression {
    readonly op = "stringLiteral";

    constructor(loc: Location, public value: string) {
        super(loc);
    }
}

export class UnaryExpression extends ConstantExpression {
    constructor(loc: Location, public readonly op: string, public body: Expression) {
        super(loc);
    }
}

export class BinaryExpression extends ConstantExpression {
    constructor(loc: Location, public readonly op: string, public lhs: Expression, public rhs: Expression) {
        super(loc);
    }
}

export class FunctionCallExpression extends ConstantExpression {
    readonly op = "functionCall";

    constructor(loc: Location, public fn: Expression, public args: AssignmentExpression[] = []) {
        super(loc);
    }
}

export class MemberAccessExpression extends ConstantExpression {
    readonly op = "access";

    constructor(loc: Location, public pointer: boolean, public lhs: Expression, public rhs: Identifier) {
        super(loc);
    }
}

export class ConditionalExpression extends ConstantExpression {
    readonly op = "conditional";

    constructor(loc: Location, public condition: Expression, public trueValue: Expression, public falseValue: Expression) {
        super(loc);
    }
}

export class AssignmentExpression extends Expression {
    readonly op = "assign";

    constructor(loc: Location, public assignType: string, public lhs: Expression, public rhs: Expression) {
        super(loc);
    }
}

// Declarations
type StorageClass = "typedef" | "extern" | "static" | "auto" | "register";
type TypeSpecifier =
    ["builtInType", "void" | "char" | "short" | "int" | "long" | "float" | "double" | "signed" | "unsigned" | "bool" | "complex" | "imaginary"]
    | StructUnionSpecifier
    | EnumSpecifier
    | ["customType", string];
type TypeQualifier = "const" | "restrict" | "volatile";
type FnSpecifier = "inline";

export class SpecifierQualifiers extends ParseNode {
    public specifierList: TypeSpecifier[] = [];
    public qualifierList: TypeQualifier[] = [];

    constructor(loc: Location, public readonly type: string = "specifiersAndQualifiers") {
        super(loc);
    }

    addSpecifier(x: TypeSpecifier): SpecifierQualifiers {
        this.specifierList.unshift(x);
        return this;
    }

    addQualifier(x: TypeQualifier): SpecifierQualifiers {
        this.qualifierList.unshift(x);
        return this;
    }
}

export class DeclarationSpecifiers extends SpecifierQualifiers {
    public storageList: StorageClass[] = [];
    public fnSpecifierList: FnSpecifier[] = [];

    constructor(loc: Location) {
        super(loc, "declarationSpecifiers");
    }

    addStorageClass(x: StorageClass): DeclarationSpecifiers {
        this.storageList.unshift(x);
        return this;
    }

    addFnSpecifier(x: FnSpecifier): DeclarationSpecifiers {
        this.fnSpecifierList.unshift(x);
        return this;
    }
}

export class EnumSpecifier extends ParseNode {
    type = "enum";

    constructor(loc: Location, public id?: string, public body?: Enumerator[]) {
        super(loc);
    }
}

export class Enumerator extends ParseNode {
    type = "enumerator";

    constructor(loc: Location, public id: string, public value?: ConstantExpression) {
        super(loc);
    }
}

export class Declaration extends ParseNode{
    readonly type = "declaration";

    constructor(loc: Location, public typeInfo: DeclarationSpecifiers, public list: (Declarator | InitDeclarator)[] = []) {
        super(loc);
    }
}

export class InitDeclarator extends ParseNode {
    readonly type= "initDeclarator";

    constructor(loc: Location, public body: Declarator, public initializer: Initializer) {
        super(loc);
    }
}

export class StructUnionSpecifier extends ParseNode {
    readonly type = "structUnionSpecifier";

    constructor(loc: Location, public structure: "struct" | "union", public id?: string, public declarations?: StructDeclaration[]) {
        super(loc);
    }
}

export class StructDeclaration extends ParseNode {
    readonly type= "structDeclaration";

    constructor(loc: Location, public typeInfo: DeclarationSpecifiers, public list: Declarator[] = []) {
        super(loc);
    }
}

export type Declarator = PointerDeclarator | IdentifierDeclarator | ArrayDeclarator | FunctionDeclarator;

export class PointerDeclarator extends ParseNode {
    readonly type= "pointerDeclarator";

    constructor(loc: Location, public pointer: Pointer, public body: Declarator) {
        super(loc);
    }
}

export class IdentifierDeclarator extends ParseNode {
    readonly type= "identifierDeclarator";

    constructor(loc: Location, public id: string) {
        super(loc);
    }
}

export class ArrayDeclarator extends ParseNode {
    readonly type= "arrayDeclarator";

    constructor(loc: Location, public body: Declarator, public length?: ConstantExpression) {
        super(loc);
    }
}

export class FunctionDeclarator extends ParseNode {
    readonly type= "functionDeclarator";

    constructor(loc: Location, public body: Declarator, public args?: string[] | ParameterDeclaration[]) {
        super(loc);
    }
}

export class ParameterDeclaration extends ParseNode {
    readonly type= "parameterDeclaration";

    constructor(loc: Location, public typeInfo: DeclarationSpecifiers, public declarator?: Declarator | AbstractDeclarator) {
        super(loc);
    }
}

export class Pointer extends ParseNode {
    readonly type= "pointer";

    constructor(loc: Location, public qualifierList?: TypeQualifier[], public body?: Pointer) {
        super(loc);
    }
}

export class TypeName extends ParseNode {
    readonly type= "typeName";

    constructor(loc: Location, public typeInfo: SpecifierQualifiers, public declarator?: AbstractDeclarator) {
        super(loc);
    }
}

export type AbstractDeclarator = AbstractPointerDeclarator | AbstractArrayDeclarator | AbstractFunctionDeclarator;

export class AbstractPointerDeclarator extends ParseNode {
    readonly type= "abstractPointerDeclarator";

    constructor(loc: Location, public pointer: Pointer, public body?: AbstractDeclarator) {
        super(loc);
    }
}

export class AbstractArrayDeclarator extends ParseNode {
    readonly type= "abstractArrayDeclarator";

    constructor(loc: Location, public body?: AbstractDeclarator, public length?: ConstantExpression) {
        super(loc);
    }
}

export class AbstractFunctionDeclarator extends ParseNode {
    readonly type= "abstractFunctionDeclarator";

    constructor(loc: Location, public body?: AbstractDeclarator, public args?: ParameterDeclaration[]) {
        super(loc);
    }
}

export type Initializer = AssignmentExpression | Initializer[];

// Statements

export abstract class Statement extends ParseNode {
    private readonly _statement: boolean = true;
}

export class IfStatement extends Statement {
    readonly type = "ifStatement";

    constructor(loc: Location, public expression: Expression, public ifBody: Statement, public elseBody?: Statement) {
        super(loc);
    }
}

export class SwitchStatement extends Statement {
    readonly type = "switchStatement";

    constructor(loc: Location, public expression: Expression, public body: Statement) {
        super(loc);
    }
}

export class CaseStatement extends Statement {
    readonly type = "caseStatement";

    constructor(loc: Location, public value: ConstantExpression, public body: Statement) {
        super(loc);
    }
}

export class DefaultStatement extends Statement {
    readonly type = "defaultStatement";

    constructor(loc: Location, public body: Statement) {
        super(loc);
    }
}

export class CompoundStatement extends Statement {
    readonly type = "compoundStatement";

    constructor(loc: Location, public body: Statement[]) {
        super(loc);
    }
}

export class ExpressionStatement extends Statement {
    readonly type = "expressionStatement";

    constructor(loc: Location, public expression: Expression) {
        super(loc);
    }
}

export class NoOp extends Statement {
    readonly type= "nopStatement";

    constructor(loc: Location) {
        super(loc);
    }
}

export class ForLoop extends Statement {
    readonly type = "forStatement";

    constructor(loc: Location,
                public init: ExpressionStatement | NoOp | Declaration,
                public test: ExpressionStatement,
                public update: Expression | undefined,
                public body: Statement) {
        super(loc);
    }
}

export class WhileLoop extends Statement {
    readonly type = "whileStatement";

    constructor(loc: Location, public test: Expression, public body: Statement) {
        super(loc);
    }
}

export class DoWhileLoop extends Statement {
    readonly type = "doWhileStatement";

    constructor(loc: Location, public body: Statement, public test: Expression) {
        super(loc);
    }
}

export class ContinueStatement extends Statement {
    readonly type = "continueStatement";
}

export class BreakStatement extends Statement {
    readonly type = "breakStatement";
}

export class ReturnStatement extends Statement {
    readonly type = "returnStatement";

    constructor(loc: Location, public value?: Expression) {
        super(loc);
    }
}

export class FunctionDefinition extends ParseNode {
    readonly type = "functionDefinition";

    constructor(loc: Location,
                public typeInfo: DeclarationSpecifiers,
                public declarator: Declarator,
                public body: Statement,
                public declarationList?: Declaration[]) {
        super(loc);
    }
}

export type TranslationUnit = (FunctionDefinition | Declaration)[];

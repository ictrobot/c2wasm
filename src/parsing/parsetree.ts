export type Location = {
    first_line: number, last_line: number, first_column: number, last_column: number,
    _source: string, _sourceId: number // hidden attributes for error printing
};

// Classes used to build up the C parse tree - mostly just simple objects storing the relevant fields.

export abstract class ParseNode {
    abstract readonly type: string;

    constructor(readonly loc: Location) {
    }

    *children(): IterableIterator<ParseNode> {
        // return any children of the node
    }
}

// Expressions

export abstract class Expression extends ParseNode {
    // typescript does structural equality when type checking, so for this class to be different from
    // the base ParseNode add a simple private field.
    private readonly _expression: boolean = true;
}

export class Identifier extends Expression {
    readonly type = "identifier";

    constructor(loc: Location, readonly name: string) {
        super(loc);
    }
}

export class Constant extends Expression {
    readonly type = "constant";

    constructor(loc: Location, readonly value: string, readonly valueType: "float" | "char" | "int" | "oct" | "hex") {
        super(loc);
    }
}

export class StringLiteral extends Expression {
    readonly type = "stringLiteral";

    constructor(loc: Location, readonly value: string) {
        super(loc);
    }
}

export const UnaryOperations = [
    "postfixIncrement", "postfixDecrement", "prefixIncrement", "prefixDecrement",
    "addressOf", "dereference", "unaryPlus", "unaryMinus", "bitwiseNot", "logicalNot"] as const;
export type UnaryOp = typeof UnaryOperations[number];
export class UnaryExpression extends Expression {
    private readonly _unaryExpr = true;

    constructor(loc: Location, readonly type: UnaryOp, readonly body: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
    }
}

export const BinaryOperations = ["arraySubscript", "comma",
    "mul", "div", "mod", "add", "sub", "bitwiseShiftLeft", "bitwiseShiftRight",
    "relationalLT", "relationalGT", "relationalLEq", "relationalGEq", "relationalEq", "relationalNEq",
    "bitwiseAnd", "bitwiseXor", "bitwiseOr", "logicalAnd", "logicalOr"] as const;
export type BinaryOp = typeof BinaryOperations[number];
export class BinaryExpression extends Expression {
    private readonly _binaryExpr = true;

    constructor(loc: Location, readonly type: BinaryOp, readonly lhs: Expression, readonly rhs: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.lhs;
        yield this.rhs;
    }
}

export class SizeofExpression extends Expression {
    readonly type = "sizeof";

    constructor(loc: Location, readonly body: Expression | TypeName) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
    }
}

export class CastExpression extends Expression {
    readonly type = "cast";

    constructor(loc: Location, readonly targetType: TypeName, readonly body: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.targetType;
        yield this.body;
    }
}

export class FunctionCallExpression extends Expression {
    readonly type = "functionCall";

    constructor(loc: Location, readonly fn: Expression, readonly args: ReadonlyArray<Expression> = []) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.fn;
        yield* this.args;
    }
}

export class MemberAccessExpression extends Expression {
    readonly type = "access";

    constructor(loc: Location, readonly pointer: boolean, readonly lhs: Expression, readonly rhs: string) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.lhs;
    }
}

export class ConditionalExpression extends Expression {
    readonly type = "conditional";

    constructor(loc: Location, readonly condition: Expression, readonly trueValue: Expression, readonly falseValue: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.condition;
        yield this.trueValue;
        yield this.falseValue;
    }
}

export type AssignmentType = undefined | "mul" | "div" | "mod" | "add" | "sub" | "leftShift"| "rightShift" | "bitwiseAnd" | "bitwiseXor" | "bitwiseOr";
export class AssignmentExpression extends Expression {
    readonly type = "assign";

    constructor(loc: Location, readonly assignType: AssignmentType, readonly lhs: Expression, readonly rhs: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.lhs;
        yield this.rhs;
    }
}

export class ConstantExpression extends Expression {
    readonly type = "constantExpr";

    constructor(loc: Location, readonly expr: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.expr;
    }
}

// Declarations
export class CustomTypeSpecifier extends ParseNode {
    readonly type = "customType";

    public constructor(loc: Location, readonly name: string) {
        super(loc);
    }
}

export type StorageClass = "typedef" | "extern" | "static"; // | "auto" | "register";
export type TypeSpecifier =
    "void" | "char" | "short" | "int" | "long" | "float" | "double" | "signed" | "unsigned" | "bool" // | "complex" | "imaginary"]
    | StructUnionSpecifier
    | EnumSpecifier
    | CustomTypeSpecifier;
export type TypeQualifier = "const"; // | "restrict" | "volatile";
export type FnSpecifier = "import" | "inline";

export class SpecifierQualifiers extends ParseNode {
    readonly type = "specifiersAndQualifiers";

    constructor(loc: Location,
                readonly specifierList: ReadonlyArray<TypeSpecifier>,
                readonly qualifierList: ReadonlyArray<TypeQualifier>) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        for (const specifier of this.specifierList) {
            if (specifier instanceof ParseNode) yield specifier;
        }
    }
}

export class DeclarationSpecifiers extends ParseNode {
    readonly type = "declarationSpecifiers";

    constructor(loc: Location,
                readonly specifierList: ReadonlyArray<TypeSpecifier>,
                readonly qualifierList: ReadonlyArray<TypeQualifier>,
                readonly storageList: ReadonlyArray<StorageClass>,
                readonly fnSpecifierList: ReadonlyArray<FnSpecifier>) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        for (const specifier of this.specifierList) {
            if (specifier instanceof ParseNode) yield specifier;
        }
    }
}

export class EnumSpecifier extends ParseNode {
    type = "enum";

    constructor(loc: Location, readonly id?: string, readonly body?: ReadonlyArray<Enumerator>) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.body) yield* this.body;
    }
}

export class Enumerator extends ParseNode {
    type = "enumerator";

    constructor(loc: Location, readonly id: string, readonly value?: ConstantExpression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.value) yield this.value;
    }
}

export class Declaration extends ParseNode{
    readonly type = "declaration";

    constructor(loc: Location, readonly typeInfo: DeclarationSpecifiers, readonly list: ReadonlyArray<Declarator | InitDeclarator> = []) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.typeInfo;
        yield* this.list;
    }
}

export class InitDeclarator extends ParseNode {
    readonly type= "initDeclarator";

    constructor(loc: Location, readonly body: Declarator, readonly initializer: Initializer) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
        yield* this.exploreInitializer();
    }

    private *exploreInitializer(initializer: Initializer = this.initializer): Iterable<ParseNode> {
        if (initializer instanceof AssignmentExpression) {
            yield initializer;
        } else if (Array.isArray(initializer)) {
            for (const x of initializer) yield* this.exploreInitializer(x);
        }
    }
}

export class StructUnionSpecifier extends ParseNode {
    readonly type = "structUnionSpecifier";

    constructor(loc: Location, readonly structure: "struct" | "union", readonly id?: string, readonly declarations?: ReadonlyArray<StructDeclaration>) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.declarations) yield* this.declarations;
    }
}

export class StructDeclaration extends ParseNode {
    readonly type= "structDeclaration";

    constructor(loc: Location, readonly typeInfo: DeclarationSpecifiers, readonly list: ReadonlyArray<Declarator> = []) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.typeInfo;
        yield* this.list;
    }
}

export type Declarator = PointerDeclarator | IdentifierDeclarator | ArrayDeclarator | FunctionDeclarator;

export class PointerDeclarator extends ParseNode {
    readonly type= "pointerDeclarator";
    readonly abstractDeclarator = false;

    constructor(loc: Location, readonly pointer: Pointer, readonly body: Declarator) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.pointer;
        yield this.body;
    }
}

export class IdentifierDeclarator extends ParseNode {
    readonly type= "identifierDeclarator";
    readonly abstractDeclarator = false;

    constructor(loc: Location, readonly id: string) {
        super(loc);
    }
}

export class ArrayDeclarator extends ParseNode {
    readonly type= "arrayDeclarator";
    readonly abstractDeclarator = false;

    constructor(loc: Location, readonly body: Declarator, readonly length?: ConstantExpression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
        if (this.length) yield this.length;
    }
}

export class FunctionDeclarator extends ParseNode {
    readonly type= "functionDeclarator";
    readonly abstractDeclarator = false;

    constructor(loc: Location, readonly body: Declarator, readonly args?: ReadonlyArray<ParameterDeclaration>, readonly variadic: boolean = false) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
        for (const value of this.args ?? []) {
            if (value instanceof ParseNode) yield value;
        }
    }
}

export class ParameterDeclaration extends ParseNode {
    readonly type= "parameterDeclaration";

    constructor(loc: Location, readonly typeInfo: DeclarationSpecifiers, readonly declarator?: Declarator | AbstractDeclarator) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.typeInfo;
        if (this.declarator) yield this.declarator;
    }
}

export class Pointer extends ParseNode {
    readonly type= "pointer";

    constructor(loc: Location, readonly qualifierList?: ReadonlyArray<TypeQualifier>, readonly body?: Pointer) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.body) yield this.body;
    }
}

export class TypeName extends ParseNode {
    readonly type= "typeName";

    constructor(loc: Location, readonly typeInfo: SpecifierQualifiers, readonly declarator?: AbstractDeclarator) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.typeInfo;
        if (this.declarator) yield this.declarator;
    }
}

export type AbstractDeclarator = AbstractPointerDeclarator | AbstractArrayDeclarator | AbstractFunctionDeclarator;

export class AbstractPointerDeclarator extends ParseNode {
    readonly type= "abstractPointerDeclarator";
    readonly abstractDeclarator = true;

    constructor(loc: Location, readonly pointer: Pointer, readonly body?: AbstractDeclarator) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.pointer;
        if (this.body) yield this.body;
    }
}

export class AbstractArrayDeclarator extends ParseNode {
    readonly type= "abstractArrayDeclarator";
    readonly abstractDeclarator = true;

    constructor(loc: Location, readonly body?: AbstractDeclarator, readonly length?: ConstantExpression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.body) yield this.body;
        if (this.length) yield this.length;
    }
}

export class AbstractFunctionDeclarator extends ParseNode {
    readonly type= "abstractFunctionDeclarator";
    readonly abstractDeclarator = true;

    constructor(loc: Location, readonly body?: AbstractDeclarator, readonly args?: ReadonlyArray<ParameterDeclaration>, readonly variadic: boolean = false) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.body) yield this.body;
        if (this.args) yield* this.args;
    }
}

export type Initializer = Expression | ReadonlyArray<Initializer>;

// Statements

export abstract class Statement extends ParseNode {
    private readonly _statement: boolean = true;
    label?: string;

    setLabel(label: string): this {
        this.label = label;
        return this;
    }
}

export class IfStatement extends Statement {
    readonly type = "ifStatement";

    constructor(loc: Location, readonly expression: Expression, readonly ifBody: Statement, readonly elseBody?: Statement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.expression;
        yield this.ifBody;
        if (this.elseBody) yield this.elseBody;
    }
}

export class SwitchStatement extends Statement {
    readonly type = "switchStatement";

    constructor(loc: Location, readonly expression: Expression, readonly body: Statement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.expression;
        yield this.body;
    }
}

export class CaseStatement extends Statement {
    readonly type = "caseStatement";

    constructor(loc: Location, readonly value: ConstantExpression, readonly body: Statement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.value;
        yield this.body;
    }
}

export class DefaultStatement extends Statement {
    readonly type = "defaultStatement";

    constructor(loc: Location, readonly body: Statement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
    }
}

export class CompoundStatement extends Statement {
    readonly type = "compoundStatement";

    constructor(loc: Location, readonly body: ReadonlyArray<Statement | Declaration>) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield* this.body;
    }
}

export class ExpressionStatement extends Statement {
    readonly type = "expressionStatement";

    constructor(loc: Location, readonly expression: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.expression;
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
                readonly init: ExpressionStatement | NoOp | Declaration,
                readonly test: ExpressionStatement | NoOp,
                readonly update: Expression | undefined,
                readonly body: Statement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.init;
        yield this.test;
        if (this.update) yield this.update;
        yield this.body;
    }
}

export class WhileLoop extends Statement {
    readonly type = "whileStatement";

    constructor(loc: Location, readonly test: Expression, readonly body: Statement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.test;
        yield this.body;
    }
}

export class DoWhileLoop extends Statement {
    readonly type = "doWhileStatement";

    constructor(loc: Location, readonly body: Statement, readonly test: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.body;
        yield this.test;
    }
}

export class GotoStatement extends Statement {
    readonly type = "gotoStatement";

    constructor(loc: Location, readonly target: string) {
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

    constructor(loc: Location, readonly value?: Expression) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        if (this.value) yield this.value;
    }
}

export class FunctionDefinition extends ParseNode {
    readonly type = "functionDefinition";

    constructor(loc: Location,
                readonly typeInfo: DeclarationSpecifiers,
                readonly declarator: Declarator,
                readonly body: CompoundStatement) {
        super(loc);
    }

    *children(): IterableIterator<ParseNode> {
        yield this.typeInfo;
        yield this.declarator;
        yield this.body;
    }
}

export type TranslationUnit = ReadonlyArray<FunctionDefinition | Declaration>;

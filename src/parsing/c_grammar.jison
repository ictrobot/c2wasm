%start ast_tree
%{
    const t = require("../parsetree");
%}
%%

// return either a translation_unit (one or more declarations) or nothing
ast_tree
    : translation_unit EOF                                                              {{ return $1; }}
    | EOF                                                                               {{ return []; }}
    ;

identifier
    : IDENTIFIER                                                                        -> yytext
    ;

constant
    : CONSTANT_FLOAT                                                                    -> new t.Constant(@$, yytext, "float")
    | CONSTANT_HEX                                                                      -> new t.Constant(@$, yytext, "hex")
    | CONSTANT_OCTAL                                                                    -> new t.Constant(@$, yytext, "oct")
    | CONSTANT_INT                                                                      -> new t.Constant(@$, yytext, "int")
    | CONSTANT_CHAR                                                                     -> new t.Constant(@$, yytext, "char")
    ;

// start of normal C grammar

primary_expression
    : identifier                                                                        -> new t.Identifier(@$, yytext)
    | constant                                                                          -> $1
    | STRING_LITERAL                                                                    -> new t.StringLiteral(@$, yytext)
    | '(' expression ')'                                                                -> $expression
    ;

postfix_expression
    : primary_expression                                                                -> $1
    | postfix_expression '[' expression ']'                                             -> new t.BinaryExpression(@$, "arraySubscript", $postfix_expression, $expression)
    | postfix_expression '(' ')'                                                        -> new t.FunctionCallExpression(@$, $postfix_expression)
    | postfix_expression '(' argument_expression_list ')'                               -> new t.FunctionCallExpression(@$, $postfix_expression, $argument_expression_list)
    | postfix_expression '.' identifier                                                 -> new t.MemberAccessExpression(@$, false, $postfix_expression, $identifier)
    | postfix_expression PTR_OP identifier                                              -> new t.MemberAccessExpression(@$, true, $postfix_expression, $identifier)
    | postfix_expression INC_OP                                                         -> new t.UnaryExpression(@$, "postfixIncrement", $1)
    | postfix_expression DEC_OP                                                         -> new t.UnaryExpression(@$, "postfixDecrement", $1)
    ;

argument_expression_list
    : assignment_expression                                                             -> [$1]
    | argument_expression_list ',' assignment_expression                                -> ($1.push($3), $1)
    ;

unary_expression
    : postfix_expression                                                                -> $1
    | INC_OP unary_expression                                                           -> new t.UnaryExpression(@$, "prefixIncrement", $2)
    | DEC_OP unary_expression                                                           -> new t.UnaryExpression(@$, "prefixDecrement", $2)
    | unary_operator cast_expression                                                    -> new t.UnaryExpression(@$, $1, $2)
    | SIZEOF unary_expression                                                           -> new t.SizeofExpression(@$, $2)
    | SIZEOF '(' type_name ')'                                                          -> new t.SizeofExpression(@$, $3)
    ;

unary_operator
    : '&'                                                                               -> "addressOf"
    | '*'                                                                               -> "dereference"
    | '+'                                                                               -> "unaryPlus"
    | '-'                                                                               -> "unaryMinus"
    | '~'                                                                               -> "bitwiseNot"
    | '!'                                                                               -> "logicalNot"
    ;

cast_expression
    : unary_expression                                                                  -> $1
    | '(' type_name ')' cast_expression                                                 -> new t.CastExpression(@$, $2, $4)
    ;

multiplicative_expression
    : cast_expression                                                                   -> $1
    | multiplicative_expression '*' cast_expression                                     -> new t.BinaryExpression(@$, "mul", $1, $3)
    | multiplicative_expression '/' cast_expression                                     -> new t.BinaryExpression(@$, "div", $1, $3)
    | multiplicative_expression '%' cast_expression                                     -> new t.BinaryExpression(@$, "mod", $1, $3)
    ;

additive_expression
    : multiplicative_expression                                                         -> $1
    | additive_expression '+' multiplicative_expression                                 -> new t.BinaryExpression(@$, "add", $1, $3)
    | additive_expression '-' multiplicative_expression                                 -> new t.BinaryExpression(@$, "sub", $1, $3)
    ;

shift_expression
    : additive_expression                                                               -> $1
    | shift_expression LEFT_OP additive_expression                                      -> new t.BinaryExpression(@$, "bitwiseShiftLeft", $1, $3)
    | shift_expression RIGHT_OP additive_expression                                     -> new t.BinaryExpression(@$, "bitwiseShiftRight", $1, $3)
    ;

relational_expression
    : shift_expression                                                                  -> $1
    | relational_expression '<' shift_expression                                        -> new t.BinaryExpression(@$, "relationalLT", $1, $3)
    | relational_expression '>' shift_expression                                        -> new t.BinaryExpression(@$, "relationalGT", $1, $3)
    | relational_expression LE_OP shift_expression                                      -> new t.BinaryExpression(@$, "relationalLEq", $1, $3)
    | relational_expression GE_OP shift_expression                                      -> new t.BinaryExpression(@$, "relationalGEq", $1, $3)
    ;

equality_expression
    : relational_expression                                                             -> $1
    | equality_expression EQ_OP relational_expression                                   -> new t.BinaryExpression(@$, "relationalEq", $1, $3)
    | equality_expression NE_OP relational_expression                                   -> new t.BinaryExpression(@$, "relationalNEq", $1, $3)
    ;

and_expression
    : equality_expression                                                               -> $1
    | and_expression '&' equality_expression                                            -> new t.BinaryExpression(@$, "bitwiseAnd", $1, $3)
    ;

exclusive_or_expression
    : and_expression                                                                    -> $1
    | exclusive_or_expression '^' and_expression                                        -> new t.BinaryExpression(@$, "bitwiseXor", $1, $3)
    ;

inclusive_or_expression
    : exclusive_or_expression                                                           -> $1
    | inclusive_or_expression '|' exclusive_or_expression                               -> new t.BinaryExpression(@$, "bitwiseOr", $1, $3)
    ;

logical_and_expression
    : inclusive_or_expression                                                           -> $1
    | logical_and_expression AND_OP inclusive_or_expression                             -> new t.BinaryExpression(@$, "logicalAnd", $1, $3)
    ;

logical_or_expression
    : logical_and_expression                                                            -> $1
    | logical_or_expression OR_OP logical_and_expression                                -> new t.BinaryExpression(@$, "logicalOr", $1, $3)
    ;

conditional_expression
    : logical_or_expression                                                             -> $1
    | logical_or_expression '?' expression ':' conditional_expression                   -> new t.ConditionalExpression(@$, $1, $3, $5)
    ;

assignment_expression
    : conditional_expression                                                            -> $1
    | unary_expression assignment_operator assignment_expression                        -> new t.AssignmentExpression(@$, $2, $1, $3)
    ;

assignment_operator
    : '='                                                                               -> undefined
    | MUL_ASSIGN                                                                        -> "mul"
    | DIV_ASSIGN                                                                        -> "div"
    | MOD_ASSIGN                                                                        -> "mod"
    | ADD_ASSIGN                                                                        -> "add"
    | SUB_ASSIGN                                                                        -> "sub"
    | LEFT_ASSIGN                                                                       -> "leftShift"
    | RIGHT_ASSIGN                                                                      -> "rightShift"
    | AND_ASSIGN                                                                        -> "bitwiseAnd"
    | XOR_ASSIGN                                                                        -> "bitwiseXor"
    | OR_ASSIGN                                                                         -> "bitwiseOr"
    ;

expression
    : assignment_expression                                                             -> $1
    | expression ',' assignment_expression                                              -> new t.BinaryExpression(@$, "comma", $1, $3)
    ;

constant_expression
    : conditional_expression                                                            -> new t.ConstantExpression(@$, $1)
    ;

declaration
    : declaration_specifiers ';'                                                        -> new t.Declaration(@$, $1)
    | declaration_specifiers init_declarator_list ';'                                   -> new t.Declaration(@$, $1, $2)
    ;

declaration_specifiers
    : storage_class_specifier                                                           -> new t.DeclarationSpecifiers(@$, [], [], [$1])
    | storage_class_specifier declaration_specifiers                                    -> new t.DeclarationSpecifiers(@$, $2.specifierList, $2.qualifierList, [$1, ...$2.storageList])
    | type_specifier                                                                    -> new t.DeclarationSpecifiers(@$, [$1], [], [])
    | type_specifier declaration_specifiers                                             -> new t.DeclarationSpecifiers(@$, [$1, ...$2.specifierList], $2.qualifierList, $2.storageList)
    | type_qualifier                                                                    -> new t.DeclarationSpecifiers(@$, [], [$1], [])
    | type_qualifier declaration_specifiers                                             -> new t.DeclarationSpecifiers(@$, $2.specifierList, [$1, ...$2.qualifierList], $2.storageList)
//  | function_specifier                                                                -> new t.DeclarationSpecifiers(@$, [], [], [], [$1])
//  | function_specifier declaration_specifiers                                         -> new t.DeclarationSpecifiers(@$, $2.specifierList, $2.qualifierList, $2.storageList, [$1, ...$2.fnSpecifierList])
    ;

init_declarator_list
    : init_declarator                                                                   -> [$1]
    | init_declarator_list ',' init_declarator                                          -> ($1.push($3), $1)
    ;

init_declarator
    : declarator                                                                        -> $1
    | declarator '=' initializer                                                        -> new t.InitDeclarator(@$, $1, $3)
    ;

storage_class_specifier
//  : TYPEDEF                                                                           -> yytext
    : EXTERN                                                                            -> yytext
    | STATIC                                                                            -> yytext
//  | AUTO                                                                              -> yytext
//  | REGISTER                                                                          -> yytext
    ;

type_specifier
    : VOID                                                                              -> yytext
    | CHAR                                                                              -> yytext
    | SHORT                                                                             -> yytext
    | INT                                                                               -> yytext
    | LONG                                                                              -> yytext
    | FLOAT                                                                             -> yytext
    | DOUBLE                                                                            -> yytext
    | SIGNED                                                                            -> yytext
    | UNSIGNED                                                                          -> yytext
//  | BOOL                                                                              -> yytext
    | struct_or_union_specifier                                                         -> $1
    | enum_specifier                                                                    -> $1
//  | TYPE_NAME                                                                         -> new t.CustomTypeSpecifier(@$, $1)
    ;

struct_or_union_specifier
    : struct_or_union identifier '{' struct_declaration_list '}'                        -> new t.StructUnionSpecifier(@$, $1, $2, $4)
    | struct_or_union '{' struct_declaration_list '}'                                   -> new t.StructUnionSpecifier(@$, $1, undefined, $3)
    | struct_or_union identifier                                                        -> new t.StructUnionSpecifier(@$, $1, $2)
    ;

struct_or_union
    : STRUCT                                                                            -> "struct"
    | UNION                                                                             -> "union"
    ;

struct_declaration_list
    : struct_declaration                                                                -> [$1]
    | struct_declaration_list struct_declaration                                        -> ($1.push($2), $1)
    ;

struct_declaration
    : specifier_qualifier_list struct_declarator_list ';'                               -> new t.StructDeclaration(@$, $1, $2)
    ;

specifier_qualifier_list
    : type_specifier specifier_qualifier_list                                           -> new t.SpecifierQualifiers(@$, [$1, ...$2.specifierList], $2.qualifierList)
    | type_specifier                                                                    -> new t.SpecifierQualifiers(@$, [$1], [])
    | type_qualifier specifier_qualifier_list                                           -> new t.SpecifierQualifiers(@$, $2.specifierList, [$1, ...$2.qualifierList])
    | type_qualifier                                                                    -> new t.SpecifierQualifiers(@$, [], [$1])
    ;

struct_declarator_list
    : struct_declarator                                                                 -> [$1]
    | struct_declarator_list ',' struct_declarator                                      -> ($1.push($3), $1)
    ;

struct_declarator
    : declarator                                                                        -> $1
    ;

enum_specifier
    : ENUM '{' enumerator_list '}'                                                      -> new t.EnumSpecifier(@$, undefined, $3)
    | ENUM identifier '{' enumerator_list '}'                                           -> new t.EnumSpecifier(@$, $2, $4)
    | ENUM '{' enumerator_list ',' '}'                                                  -> new t.EnumSpecifier(@$, undefined, $3)
    | ENUM identifier '{' enumerator_list ',' '}'                                       -> new t.EnumSpecifier(@$, $2, $4)
    | ENUM identifier                                                                   -> new t.EnumSpecifier(@$, $2)
    ;

enumerator_list
    : enumerator                                                                        -> [$1]
    | enumerator_list ',' enumerator                                                    -> ($1.push($3), $1)
    ;

enumerator
    : identifier                                                                        -> new t.Enumerator(@$, $1)
    | identifier '=' constant_expression                                                -> new t.Enumerator(@$, $1, $3)
    ;

type_qualifier
    : CONST                                                                             -> "const"
//  | VOLATILE                                                                          -> "volatile"
    ;

// function_specifier
//  : INLINE                                                                            -> "inline"
//  ;

declarator
    : pointer direct_declarator                                                         -> new t.PointerDeclarator(@$, $1, $2)
    | direct_declarator                                                                 -> $1
    ;

// modified from assignment_expression to constant_expression
direct_declarator
    : identifier                                                                        -> new t.IdentifierDeclarator(@$, $1)
    | '(' declarator ')'                                                                -> $2
    | direct_declarator '[' constant_expression ']'                                     -> new t.ArrayDeclarator(@$, $1, $3)
    | direct_declarator '[' ']'                                                         -> new t.ArrayDeclarator(@$, $1)
    | direct_declarator '(' parameter_type_list ')'                                     -> new t.FunctionDeclarator(@$, $1, $3)
//  | direct_declarator '(' identifier_list ')'                                         -> new t.FunctionDeclarator(@$, $1, $3)
    | direct_declarator '(' ')'                                                         -> new t.FunctionDeclarator(@$, $1)
    ;

pointer
    : '*'                                                                               -> new t.Pointer(@$)
    | '*' type_qualifier_list                                                           -> new t.Pointer(@$, $2)
    | '*' pointer                                                                       -> new t.Pointer(@$, undefined, $2)
    | '*' type_qualifier_list pointer                                                   -> new t.Pointer(@$, $2, $3)
    ;

type_qualifier_list
    : type_qualifier                                                                    -> [$1]
    | type_qualifier_list type_qualifier                                                -> ($1.push($2), $1)
    ;


parameter_type_list
    : parameter_list                                                                    -> $1
//  | parameter_list ',' ELLIPSIS                                                       {{ throw new JisonParserError("Unsupported rule: parameter_type_list (ellipsis)"); }}
    ;

parameter_list
    : parameter_declaration                                                             -> [$1]
    | parameter_list ',' parameter_declaration                                          -> ($1.push($3), $1)
    ;

parameter_declaration
    : declaration_specifiers declarator                                                 -> new t.ParameterDeclaration(@$, $1, $2)
    | declaration_specifiers abstract_declarator                                        -> new t.ParameterDeclaration(@$, $1, $2)
    | declaration_specifiers                                                            -> new t.ParameterDeclaration(@$, $1)
    ;

// identifier_list
//  : identifier                                                                        -> [$1]
//  | identifier_list ',' identifier                                                    -> ($1.push($3), $1)
//  ;

type_name
    : specifier_qualifier_list                                                          -> new t.TypeName(@$, $1)
    | specifier_qualifier_list abstract_declarator                                      -> new t.TypeName(@$, $1, $2)
    ;

abstract_declarator // declarator without type name
    : pointer                                                                           -> new t.AbstractPointerDeclarator(@$, $1)
    | direct_abstract_declarator                                                        -> $1
    | pointer direct_abstract_declarator                                                -> new t.AbstractPointerDeclarator(@$, $1, $2)
    ;

// modified from assignment_expression to constant_expression
direct_abstract_declarator
    : '(' abstract_declarator ')'                                                       -> $2
    | '[' ']'                                                                           -> new t.AbstractArrayDeclarator(@$)
    | '[' constant_expression ']'                                                       -> new t.AbstractArrayDeclarator(@$, undefined, $2)
    | direct_abstract_declarator '[' ']'                                                -> new t.AbstractArrayDeclarator(@$, $1)
    | direct_abstract_declarator '[' constant_expression ']'                            -> new t.AbstractArrayDeclarator(@$, $1, $3)
    | '(' ')'                                                                           -> new t.AbstractFunctionDeclarator(@$)
    | '(' parameter_type_list ')'                                                       -> new t.AbstractFunctionDeclarator(@$, undefined, $2)
    | direct_abstract_declarator '(' ')'                                                -> new t.AbstractFunctionDeclarator(@$, $1)
    | direct_abstract_declarator '(' parameter_type_list ')'                            -> new t.AbstractFunctionDeclarator(@$, $1, $3)
    ;

initializer
    : assignment_expression                                                             -> $1
    | '{' initializer_list '}'                                                          -> $2
    | '{' initializer_list ',' '}'                                                      -> $2
    ;

initializer_list
    : initializer                                                                       -> [$1]
    | initializer_list ',' initializer                                                  -> ($1.push($3), $1)
    ;

statement
    : labeled_statement                                                                 -> $1
    | compound_statement                                                                -> $1
    | expression_statement                                                              -> $1
    | selection_statement                                                               -> $1
    | iteration_statement                                                               -> $1
    | jump_statement                                                                    -> $1
    ;

labeled_statement
//  : identifier ':' statement                                                          {{ throw new JisonParserError("Unsupported rule: labeled_statement (goto)"); }}
    : CASE constant_expression ':' statement                                            -> new t.CaseStatement(@$, $2, $4)
    | DEFAULT ':' statement                                                             -> new t.DefaultStatement(@$, $3)
    ;

compound_statement
    : '{' '}'                                                                           -> new t.CompoundStatement(@$, [])
    | '{' block_item_list '}'                                                           -> new t.CompoundStatement(@$, $2)
    ;

block_item_list
    : block_item                                                                        -> [$1]
    | block_item_list block_item                                                        -> ($1.push($2), $1)
    ;

block_item
    : declaration                                                                       -> $1
    | statement                                                                         -> $1
    ;

expression_statement
    : ';'                                                                               -> new t.NoOp(@$)
    | expression ';'                                                                    -> new t.ExpressionStatement(@$, $1)
    ;

selection_statement
    : IF '(' expression ')' statement                                                   -> new t.IfStatement(@$, $3, $5)
    | IF '(' expression ')' statement ELSE statement                                    -> new t.IfStatement(@$, $3, $5, $7)
    | SWITCH '(' expression ')' statement                                               -> new t.SwitchStatement(@$, $3, $5)
    ;

iteration_statement
    : WHILE '(' expression ')' statement                                                -> new t.WhileLoop(@$, $3, $5)
    | DO statement WHILE '(' expression ')' ';'                                         -> new t.DoWhileLoop(@$, $2, $5)
    | FOR '(' expression_statement expression_statement ')' statement                   -> new t.ForLoop(@$, $3, $4, undefined, $6)
    | FOR '(' expression_statement expression_statement expression ')' statement        -> new t.ForLoop(@$, $3, $4, $5, $7)
    | FOR '(' declaration expression_statement ')' statement                            -> new t.ForLoop(@$, $3, $4, undefined, $6)
    | FOR '(' declaration expression_statement expression ')' statement                 -> new t.ForLoop(@$, $3, $4, $5, $7)
    ;

jump_statement
//  : GOTO identifier ';'                                                               {{ throw new JisonParserError("Unsupported rule: jump_statement"); }}
    : CONTINUE ';'                                                                      -> new t.ContinueStatement(@$)
    | BREAK ';'                                                                         -> new t.BreakStatement(@$)
    | RETURN ';'                                                                        -> new t.ReturnStatement(@$)
    | RETURN expression ';'                                                             -> new t.ReturnStatement(@$, $2)
    ;

translation_unit
    : external_declaration                                                              -> [$1]
    | translation_unit external_declaration                                             -> ($1.push($2), $1)
    ;

external_declaration
    : function_definition                                                               -> $1
    | declaration                                                                       -> $1
    ;

function_definition
//  : declaration_specifiers declarator declaration_list compound_statement             -> new t.FunctionDefinition(@$, $1, $2, $4, $3)
    : declaration_specifiers declarator compound_statement                              -> new t.FunctionDefinition(@$, $1, $2, $3)
    ;

// old-style (K&R) function definition
// declaration_list
//  : declaration                                                                       -> [$1]
//  | declaration_list declaration                                                      -> ($1.push($2), $1)
//  ;

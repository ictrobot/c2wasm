import moo from "moo";

const keywords = [
    // probably unsupported tokens
    "auto", "extern", "goto", "register", "inline", "enum",

    "if", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "float", "for", "int",
    "long", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned",
    "void", "volatile", "while"
];

const simpleSymbols = [';','{','}',',',':','=','(',')','[',']','.','&','!','~','-','+','*','/','%','<','>','^','|','?'];

export const lexer = moo.compile({
    _comment: {match: /(?:\/\*[^]*?\*\/)|(?:\/\/.*?$)/, multiline: true},
    IDENTIFIER: {
        match: /[a-zA-Z_][a-zA-Z0-9_]*/,
        type: moo.keywords(Object.fromEntries(keywords.map(x => [x.toUpperCase(), x])))
    },
    CONSTANT_FLOAT: /(?:[0-9]+[Ee][+-]?[0-9]+)|(?:(?:(?:[0-9]*\.[0-9]+)|(?:[0-9]+\.[0-9]*))(?:[Ee][+-]?[0-9]+)?)[fFlL]?/,
    CONSTANT_HEX: /0[xX][a-fA-F0-9]+(?:[uU][lL]?|[lL][uU]?|)/,
    CONSTANT_OCTAL: /0[0-7]+(?:[uU][lL]?|[lL][uU]?|)/,
    CONSTANT_INT: /(?:[1-9][0-9]*|0)(?:[uU][lL]?|[lL][uU]?|)/,
    CONSTANT_CHAR: {match: /'(?:[^\\\n']|\\.)'/, value: x => x.slice(1, -1)},
    STRING_LITERAL: {match: /"(?:\\.|[^\\"])*"/, value: x => x.slice(1, -1)},
    ELLIPSIS: "...",
    RIGHT_ASSIGN: ">>=",
    LEFT_ASSIGN: "<<=",
    ADD_ASSIGN: "+=",
    SUB_ASSIGN: "-=",
    MUL_ASSIGN: "*=",
    DIV_ASSIGN: "/=",
    MOD_ASSIGN: "%=",
    AND_ASSIGN: "&=",
    XOR_ASSIGN: "^=",
    OR_ASSIGN: "|=",
    RIGHT_OP: ">>",
    LEFT_OP: "<<",
    INC_OP: "++",
    DEC_OP: "--",
    PTR_OP: "->",
    AND_OP: "&&",
    OR_OP: "||",
    LE_OP: "<=",
    GE_OP: ">=",
    EQ_OP: "==",
    NE_OP: "!=",
    ...Object.fromEntries(simpleSymbols.map(x => [x,x])),
    _whitespace: [
        {match: /[ \t\v\f]+/},
        {match: /\n/, lineBreaks: true},
    ],
});

// automatically skip tokens starting with "_", i.e. whitespace, line breaks and comments
lexer.next = (next => () => {
    let tok = next.call(lexer);
    while (tok?.type?.charAt(0) === '_') tok = next.call(lexer);
    return tok;
})(lexer.next);

import moo from "moo";

const keywords = [
    "if", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float",
    "for", "int", "long", "return", "short", "signed", "sizeof", "static", "struct", "switch", "union", "unsigned",
    "void", "while", "_Bool",

    // currently unsupported (but still lex so parser throws error)
    "auto", "goto", "inline", "register", "typedef", "volatile",

    // special for c2wasm, not on spec
    "import"
];

const simpleSymbols = [';','{','}',',',':','=','(',')','[',']','.','&','!','~','-','+','*','/','%','<','>','^','|','?'];

export const lexer = moo.compile({
    $comment: {match: /(?:\/\*[^]*?\*\/)|(?:\/\/.*?$)/, multiline: true},
    IDENTIFIER: {
        match: /[a-zA-Z_][a-zA-Z0-9_]*/,
        type: moo.keywords(Object.fromEntries(keywords.map(x => [x.toUpperCase(), x])))
    },
    CONSTANT_FLOAT: /(?:[0-9]+[Ee][+-]?[0-9]+|(?:[0-9]*\.[0-9]+|[0-9]+\.[0-9]*)(?:[Ee][+-]?[0-9]+)?)[fFlL]?|(?:[1-9][0-9]*|0)[fF]/,
    CONSTANT_HEX: /0[xX][a-fA-F0-9]+(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?|)/,
    CONSTANT_OCTAL: /0[0-7]+(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?|)/,
    CONSTANT_INT: /(?:[1-9][0-9]*|0)(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?|)/,
    CONSTANT_CHAR: {match: /'(?:[^\\\n']|\\(?:.|x[0-9a-fA-F]{1,2}|[0-7]{1,3}))'/, value: x => x.slice(1, -1)},
    STRING_LITERAL: {match: /"(?:[^\\\n"]|\\(?:[^x0-7\n]|x[0-9a-fA-F]{1,2}|[0-7]{1,3}))*"/, value: x => x.slice(1, -1)},
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
    $whitespace: [
        {match: /[ \t\v\f]+/},
        {match: /\n/, lineBreaks: true},
    ],
});

// automatically skip tokens starting with "$", i.e. whitespace, line breaks and comments
lexer.next = (next => () => {
    let tok = next.call(lexer);
    while (tok?.type?.charAt(0) === '$') tok = next.call(lexer);
    return tok;
})(lexer.next);

import {CError} from "../c_error";
import {ParseNode} from "./parsetree";

export type Location = {
    first_line: number,
    last_line: number,
    first_column: number,
    last_column: number,
    source: string,
};

const keywords = Object.fromEntries([
    "if", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float",
    "for", "inline", "int", "long", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef",
    "union", "unsigned", "void", "while", "_Bool", "goto",

    // currently unsupported (but still lex so parser throws error)
    "auto", "register", "volatile",

    // special for c2wasm, not on spec
    "import"
].map(x => [x, x.toUpperCase()]));

const symbols = [
    "...","<<=",">>=",
    "!=","%=","&&","&=","*=","++","+=","--","-=","->","/=","<<","<=","==",">=",">>","^=","|=","||",
    "!","%","&","(",")","*","+",",","-",".","/",":",";","<","=",">","?","[","]","^","{","|","}","~"
];

const rules: {regex: RegExp, type: string | ((s: string) => string), value?: (s: string) => string}[] = [
    {
        type: (s) => keywords[s] ?? 'IDENTIFIER',
        regex: /[a-zA-Z_][a-zA-Z0-9_]*/,
    },
    {
        type: x => x,
        regex: new RegExp(symbols.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')),
    },
    {
        type: 'CONSTANT_FLOAT',
        regex: /(?:[0-9]+[Ee][+-]?[0-9]+|(?:[0-9]*\.[0-9]+|[0-9]+\.[0-9]*)(?:[Ee][+-]?[0-9]+)?)[fFlL]?|(?:[1-9][0-9]*|0)[fF]/,
    },
    {
        type: 'CONSTANT_HEX',
        regex: /0[xX][a-fA-F0-9]+(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?|)/,
    },
    {
        type: 'CONSTANT_OCTAL',
        regex: /0[0-7]+(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?|)/,
    },
    {
        type: 'CONSTANT_INT',
        regex: /(?:[1-9][0-9]*|0)(?:[uU][lL]{0,2}|[lL]{1,2}[uU]?|)/,
    },
    {
        type: 'CONSTANT_CHAR',
        regex: /'(?:[^\\\n']|\\(?:.|x[0-9a-fA-F]{1,2}|[0-7]{1,3}))'/,
        value: x => x.slice(1, -1),
    },
    {
        type: 'STRING_LITERAL',
        regex: /"(?:[^\\\n"]|\\(?:[^x0-7\n]|x[0-9a-fA-F]{1,2}|[0-7]{1,3}))*"/,
        value: x => x.slice(1, -1),
    },
];

export class Lexer {
    static regex = new RegExp(rules.map(x => '(' + x.regex.source + ')').join('|'), 'ym');

    private source = '';
    private index = 0;
    private line = 0;
    private col = 0;

    next(): {type: string, value: string, text: string, loc: Location} {
        // Skip whitespace
        while (this.index < this.source.length && (this.source[this.index] === ' '
            || this.source[this.index] === '\t' || this.source[this.index] === '\v'
            || this.source[this.index] === '\f' || this.source[this.index] === '\n')) {

            if (this.source[this.index] === '\n') {
                this.line++;
                this.col = 1;
            } else {
                this.col++;
            }
            this.index++;
        }

        const loc: Location = {
            first_line: this.line,
            first_column: this.col,
            last_line: this.line,
            last_column: this.col + 1,
            source: this.source,
        };

        // Reached end of source
        if (this.index === this.source.length) {
            return {type: 'EOF', value: '', text: '', loc};
        }

        // Match sticky regex from current index
        Lexer.regex.lastIndex = this.index;
        const match = Lexer.regex.exec(this.source);
        if (!match) throw new LexerError(loc);

        // Update location information
        const text = match[0];
        this.index += text.length;
        this.col += text.length;
        loc.last_column = this.col;

        // group[n+1] !== undefined means that rule[n] matched
        let groupIdx = 0;
        while (match[groupIdx + 1] === undefined) groupIdx++;
        const group = rules[groupIdx];

        return {
            type: typeof group.type === 'function' ? group.type(text) : group.type,
            value: group.value?.(text) ?? text,
            text, loc,
        };
    }

    reset(s: string) {
        this.source = s;
        this.index = 0;
        this.line = 0;
        this.col = 1;
    }
}

class LexerError extends CError {
    name = "LexerError";

    constructor(loc: Location) {
        super("Unknown token", new class extends ParseNode {
            type = "Unknown";
        }(loc));
    }
}

export const lexer = new Lexer();

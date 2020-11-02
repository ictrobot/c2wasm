import {locationString} from "../c_error";
import {lexer} from "./lexer";
import gen from "./gen/c_grammar";
import * as parsetree from "./parsetree";
import {validate} from "./validation";

function newLocation(): parsetree.Location {
    return {first_line: 0, first_column: 0, last_line: 0, last_column: 0, _source: "", _sourceId: 0};
}
let nextSourceId: number = 1;

// adapt moo parser to work with Jison
class WrappedLexer {
    yytext?: string;
    yylloc: parsetree.Location = newLocation();
    yylineno: number = 0;

    /** return the token type and update yytext, yylloc, yylineno */
    lex(): string {
        const token = lexer.next();
        this.yytext = token?.value;
        if (!token || !token.type) {
            // no more tokens, end of file reached
            return "EOF";
        }

        this.yylloc = {
            first_line: token.line - 1,
            first_column: token.col,
            last_line: token.line + token.lineBreaks - 1,
            last_column: token.lineBreaks ? 0 : token.col + token.text.length,
            _sourceId: this.yylloc._sourceId,
            _source: this.yylloc._source
        };
        this.yylineno = this.yylloc.first_line;

        return token.type;
    }

    setInput(input: string): void {
        // completely reset all state
        this.yylloc = newLocation();
        this.yylineno = 0;
        this.yytext = undefined;

        lexer.reset(input);
        this.yylloc._source = input;
        this.yylloc._sourceId = nextSourceId++;
    }
}

// provide the generated parser with our custom lexer
const generatedParser = gen as any;
generatedParser.parser.lexer = new WrappedLexer();

/**
 * Parse the input string into a parse tree and perform some basic validation
 */
export function parse(input: string): parsetree.TranslationUnit {
    try {
        const tree = generatedParser.parse(input);
        return validate(tree);
    } catch (e) {
        if (e?.hash?.loc) { // Jison parse errors
            e.message += "\n\n" + locationString(e.hash?.loc);
        }
        throw e;
    }
}

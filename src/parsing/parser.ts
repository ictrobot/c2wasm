import {lexer} from "./lexer";
import gen from "./gen/c_grammar";
import * as parsetree from "./parsetree";
import {validate} from "./validation";

// adapt moo parser to work with Jison
class WrappedLexer {
    yytext?: string;
    yylloc: parsetree.Location = {first_line: 0, first_column: 0, last_line: 0, last_column: 0};
    yylineno: number = 0;

    /** return the token type and update yytext, yylloc, yylineno */
    lex(): string {
        const token = lexer.next();
        this.yytext = token?.value;
        if (!token || !token.type) {
            // no more tokens, end of file reached
            return "EOF";
        }

        // line pos
        this.yylineno = this.yylloc.first_line = token.line - 1;
        this.yylloc.last_line = this.yylineno + token.lineBreaks;

        // column pos
        this.yylloc.first_column = this.yylloc.last_column = token.col;
        this.yylloc.last_column = token.lineBreaks ? 0 : this.yylloc.first_column + token.text.length;

        return token.type;
    }

    setInput(input: string): void {
        lexer.reset(input);
        // completely reset all state
        this.yylloc.first_line = this.yylloc.first_column = this.yylloc.last_line = this.yylloc.last_column = 0;
        this.yylineno = 0;
        this.yytext = undefined;
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
            e.message += "\n\nLocation:\n" + (locationString(e.hash.loc, input) ?? "");
        } else if (e?.node?.loc) { // Validation errors
            e.message += "\n\nLocation:\n" + (locationString(e.node.loc, input) ?? "");
        }
        throw e;
    }
}

export function locationString(loc: parsetree.Location, input: string): string | undefined {
    const lines = input.split("\n");
    if (loc.first_line - 1 >= lines.length) return;

    let output = "";

    const lnumDigits = Math.ceil(Math.log10(loc.last_line + 4));
    function outputLine(lnum: number) {
        output += `L${(lnum + 1).toString().padStart(lnumDigits, '0')}: ${lines[lnum]}\n`;
    }

    if (loc.first_line > 1) outputLine(loc.first_line - 2);
    if (loc.first_line > 0) outputLine(loc.first_line - 1);
    outputLine(loc.first_line);

    // output ^^^ arrows
    output += new Array(3 + lnumDigits + loc.first_column).join(" ");
    if (loc.first_line === loc.last_line) {
        output += new Array(1 + loc.last_column - loc.first_column).join("^");
    } else {
        output += "^";
    }
    output += "\n";

    if (loc.first_line + 1 < lines.length) outputLine(loc.first_line + 1);
    if (loc.first_line + 2 < lines.length) outputLine(loc.first_line + 2);
    return output;
}

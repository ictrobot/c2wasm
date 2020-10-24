import {lexer} from "./lexer";
import gen from "./gen/c_grammar";
import * as parsetree from "./parsetree";

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

export function parse(s: string): parsetree.TranslationUnit {
    return generatedParser.parse(s);
}

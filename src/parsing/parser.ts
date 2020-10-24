import {lexer} from "./lexer";

const generatedParser = require("./gen/c_grammar") as any;

// adapt moo parser to work with Jison
class WrappedLexer {
    yytext: string | undefined = "";

    lex(): string {
        const token = lexer.next();
        this.yytext = token?.value;
        if (!token || !token.type) return "EOF";
        return token.type;
    }

    setInput(input: string): void {
        lexer.reset(input);
    }
}
// provide the generated parser with our custom lexer
generatedParser.parser.lexer = new WrappedLexer();

export function parse(s: String): unknown {
    return generatedParser.parse(s);
}

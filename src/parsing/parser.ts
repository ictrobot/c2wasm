import {lexer} from "./lexer";
import gen from "./gen/c_grammar";

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
const generatedParser = gen as any;
generatedParser.parser.lexer = new WrappedLexer();

export function parse(s: string): unknown {
    return generatedParser.parse(s);
}

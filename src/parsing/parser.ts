import {locationString} from "../c_error";
import gen from "./gen/c_grammar";
import {lexer, Location} from "./lexer";
import * as parsetree from "./parsetree";
import {validate} from "./validation";

// adapt lexer to work with Jison
class WrappedLexer {
    yytext?: string;
    yylloc?: Location;
    yylineno?: number;

    private types = new Map<string, boolean>();

    /** return the token type and update yytext, yylloc, yylineno */
    lex(): string {
        const token = lexer.next();
        this.yytext = token.value;
        this.yylloc = token.loc;
        this.yylineno = token.loc.first_line;

        if (token.type === "IDENTIFIER" && this.types.get(token.text)) {
            return "TYPE_NAME";
        }
        return token.type;
    }

    setInput(input: string): void {
        this.yytext = undefined;
        this.yylloc = undefined;
        this.yylineno = undefined;
        this.types.clear();

        lexer.reset(input);
    }

    externalDeclaration(d: parsetree.Declaration) {
        if (d.typeInfo.storageList[0] !== "typedef") return;

        for (let declarator of d.list) {
            while (!(declarator instanceof parsetree.IdentifierDeclarator)) declarator = declarator.body;
            this.types.set(declarator.id, true);
        }
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

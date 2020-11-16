import {Definition} from "./definition";
import {consume, mustConsume, tryConsume, consumeAny, PreProRegex} from "./helpers";

export class Preprocessor {
    definitions: Map<string, Definition> = new Map<string, Definition>();

    process(text: string): string {
        // remove comments
        text = text.replace(PreProRegex.comments, " ");

        let output = "";
        for (const line of text.split("\n")) {
            if (line.startsWith("#")) {
                if (tryConsume(line, "#define", m => this._define(m.remainingLine))) {
                    // define
                } else if (tryConsume(line, "#undef", m => this._undef(m.remainingLine))) {
                    // undef
                } else if (line.trim().length > 1) {
                    throw new Error("Unknown preprocessor directive");
                }

            } else {
                output += this.expandDefinitions(line) + "\n";
            }
        }
        return output;
    }

    expandDefinitions(line: string): string {
        let output = "";
        while (line.length > 0) {
            const token = consumeAny(line);
            if (token?.type === "identifier") {
                const def = this.definitions.get(token.value);
                if (def !== undefined) {
                    const e = def.expand(token.remainingLine);
                    output += e.output;
                    line = e.line;
                    continue;
                }
            }
            output += token?.value;
            line = token.remainingLine;
        }
        return output;
    }

    private _define(line: string) {
        line = mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = mustConsume(line, PreProRegex.identifier, "identifier");
        const tokens = [];
        const parameters: string[] = [];

        if (identifier.remainingLine.trim().length > 0) {
            if (identifier.remainingLine[0] === "(") {
                // definition with parameters
                line = mustConsume(identifier.remainingLine, "(").remainingLine;
                while (line.length > 0) {
                    line = consume(line, PreProRegex.whitespace).remainingLine;
                    const parameter = mustConsume(line, PreProRegex.identifier, "identifier");
                    parameters.push(parameter.value);
                    line = consume(parameter.remainingLine, PreProRegex.whitespace).remainingLine;

                    if (line.length === 0) {
                        throw new Error("Unexpected end of line");
                    } else if (line[0] === ",") {
                        line = mustConsume(line, ",").remainingLine;
                    } else if (line[0] === ")") {
                        break;
                    } else {
                        throw new Error("Unexpected");
                    }
                }
                line = mustConsume(line, ")").remainingLine;
                line = mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;

            } else {
                // normal definition
                line = mustConsume(identifier.remainingLine, PreProRegex.whitespace, "whitespace").remainingLine;
            }

            // body
            while (line.length > 0) {
                const token = consumeAny(line);
                tokens.push(token);
                line = token.remainingLine;
            }
        }

        const def = new Definition(this, identifier.value, tokens, parameters);
        const existing = this.definitions.get(identifier.value);
        if (existing !== undefined && !def.equals(existing)) {
            throw new Error("Duplicate defines must be the same");
        }
        this.definitions.set(identifier.value, def);
    }

    private _undef(line: string) {
        line = mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = mustConsume(line, PreProRegex.identifier, "identifier");
        if (identifier.remainingLine.trim().length !== 0) throw new Error("Unexpected extra characters in undef");
        this.definitions.delete(identifier.value);
    }

}

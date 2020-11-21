import {Token, PreProRegex} from "./helpers";
import type {Preprocessor} from "./preprocessor";

export class Definition {

    constructor(readonly preprocessor: Preprocessor,
                readonly identifier: string,
                readonly replacement: Token[],
                readonly parameters: string[]) {
    }

    expand(line: string): { output: string, line: string } {
        if (this.parameters.length > 0) return this.expandWithParameters(line);

        const output = this.replacement.map(x => x.value).join("");
        return {output, line};
    }

    private expandWithParameters(line: string) {
        // check if macro call
        const originalLine = line;
        line = this.preprocessor.consume(line, PreProRegex.whitespace).remainingLine;
        if (line.length === 0 || line[0] !== "(") {
            // not referencing the definition
            return {output: this.identifier, line: originalLine};
        }
        line = this.preprocessor.mustConsume(line, "(").remainingLine;

        // consume args
        const args: string[] = [];
        for (let i = 0; i < this.parameters.length; i++) {
            const match = this.consumeArgument(line);
            args.push(match.value.trim());
            if (i !== this.parameters.length - 1) {
                line = this.preprocessor.mustConsume(match.remainingLine, ",").remainingLine;
            } else {
                line = this.preprocessor.mustConsume(match.remainingLine, ")").remainingLine;
            }
        }

        // assemble output
        let output = "";
        for (const token of this.replacement) {
            if (token.type === "identifier") {
                const index = this.parameters.indexOf(token.value);
                if (index >= 0) {
                    output += this.preprocessor.expandDefinitions(args[index]);
                    continue; // TODO repeat as needed
                }
            }
            output += token.value;
        }
        return {output, line};
    }

    private consumeArgument(line: string): {value: string, remainingLine: string} {
        const out = {value: "", remainingLine: line};
        let inQuote = false, bracketDepth = 0;

        while (out.remainingLine.length > 0 && (inQuote || bracketDepth !== 0 || (out.remainingLine[0] !== "," && out.remainingLine[0] !== ")"))) {
            const char = out.remainingLine[0];
            let consumed = 1;

            if (inQuote && char === `\\` && out.remainingLine[0] === `"`) {
                // escaped quote
                consumed = 2;
            } else if (char === `"`) {
                inQuote = !inQuote;
            } else if (char === `(` && !inQuote) {
                bracketDepth++;
            } else if (char === `)` && !inQuote) {
                bracketDepth--;
            }

            out.value += out.remainingLine.substring(0, consumed);
            out.remainingLine = out.remainingLine.substring(consumed);
        }
        return out;
    }

    equals(t: this): boolean {
        return t.identifier === this.identifier &&
            t.replacement.length === this.replacement.length &&
            t.replacement.every((v, i) => v.value === this.replacement[i].value) &&
            t.parameters.length === this.parameters.length &&
            t.parameters.every((v, i) => v === this.parameters[i]);
    }
}

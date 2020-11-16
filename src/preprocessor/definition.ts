import {Token, PreProRegex, consume, mustConsume} from "./helpers";
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
        line = consume(line, PreProRegex.whitespace).remainingLine;
        if (line.length === 0 || line[0] !== "(") {
            // not referencing the definition
            return {output: this.identifier, line: originalLine};
        }
        line = mustConsume(line, "(").remainingLine;

        // consume args
        const args: string[] = [];
        for (let i = 0; i < this.parameters.length; i++) {
            const match = mustConsume(line, PreProRegex.definitionArgument, "macro argument");
            args.push(match.value.trim());
            if (i !== this.parameters.length - 1) {
                line = mustConsume(match.remainingLine, ",").remainingLine;
            } else {
                line = mustConsume(match.remainingLine, ")").remainingLine;
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

    equals(t: this): boolean {
        return t.identifier === this.identifier &&
            t.replacement.length === this.replacement.length &&
            t.replacement.every((v, i) => v.value === this.replacement[i].value) &&
            t.parameters.length === this.parameters.length &&
            t.parameters.every((v, i) => v === this.parameters[i]);
    }
}

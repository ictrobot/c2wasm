import {LIBRARY_HEADERS} from "../c_library/standard_library";
import {Definition} from "./definition";
import {consume, mustConsume, consumeAny, PreProRegex} from "./helpers";

export class Preprocessor {
    definitions = new Map<string, Definition>();

    libraryFiles: Map<string, string>; // #include <...>
    userFiles = new Map<string, string>(); // #include "..."

    constructor(readonly filename: string, standardHeaders: boolean = true) {
        if (standardHeaders) {
            this.libraryFiles = new Map<string, string>(LIBRARY_HEADERS);
        } else {
            this.libraryFiles = new Map<string, string>();
        }

        this.definitions.set("__FILE__", new Definition(this, "__FILE__", [{value: `"${filename}"`}], []));
    }

    process(text: string, filename: string = this.filename): string {
        // remove comments
        text = text.replace(PreProRegex.comments, " ");

        let output = "";
        const lines = text.split("\n");
        while (lines.length > 0) {
            const line = lines.shift() as string;

            if (line.startsWith("#")) {
                let match: ReturnType<typeof consume>;
                if ((match = consume(line, "#define")).success) {
                    this._define(match.remainingLine);
                } else if ((match = consume(line, "#undef")).success) {
                    this._undef(match.remainingLine);
                } else if ((match = consume(line, "#include")).success) {
                    output += this._include(match.remainingLine) + "\n";
                } else if ((match = consume(line, "#ifdef")).success) {
                    output += this._ifdef(match.remainingLine, true, lines);
                } else if ((match = consume(line, "#ifndef")).success) {
                    output += this._ifdef(match.remainingLine, false, lines);
                } else if ((match = consume(line, "#pragma")).success) {
                    const l = mustConsume(match.remainingLine, PreProRegex.whitespace, "whitespace").remainingLine;
                    if (l.trim() === "once") {
                        // only include source file once
                        const defName = `__pragma_once_${filename}__`;
                        if (this.definitions.has(defName)) return output;
                        this.definitions.set(defName, new Definition(this, defName, [], []));
                    }
                    // unknown pragmas must be ignored
                } else if (line.trim().length > 1) {
                    throw this.error("Unknown preprocessor directive");
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

    private error(message: string): Error {
        return new class extends Error {
            name = "PreprocessorError";
        }(`In file '${this.filename}': ${message}`);
    }

    private _include(line: string): string {
        line = mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine.trim();
        if (line.startsWith('"') && line.endsWith('"')) {
            return this._includeUser(line.substring(1, line.length - 1));
        } else if (line.startsWith("<") && line.endsWith(">")) {
            return this._includeLib(line.substring(1, line.length - 1));
        }

        // if failed try expand macros
        line = this.expandDefinitions(line);
        if (line.startsWith('"') && line.endsWith('"')) {
            return this._includeUser(line.substring(1, line.length - 1));
        } else if (line.startsWith("<") && line.endsWith(">")) {
            return this._includeLib(line.substring(1, line.length - 1));
        }

        throw this.error("Invalid #include");
    }

    private _includeLib(path: string) {
        const file = this.libraryFiles.get(path);
        if (file === undefined) throw this.error("Unknown path `" + path + "`");
        return this.process(file, `<${path}>`);
    }

    private _includeUser(path: string) {
        const file = this.userFiles.get(path);
        if (file === undefined) return this._includeLib(path);
        return this.process(file, path);
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
                        throw this.error("Unexpected end of line");
                    } else if (line[0] === ",") {
                        line = mustConsume(line, ",").remainingLine;
                    } else if (line[0] === ")") {
                        break;
                    } else {
                        throw this.error("Unexpected");
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
                if (token.type !== "identifier" || !parameters.includes(token.value)) {
                    token.value = this.expandDefinitions(token.value);
                }

                tokens.push(token);
                line = token.remainingLine;
            }
        }

        const def = new Definition(this, identifier.value, tokens, parameters);
        const existing = this.definitions.get(identifier.value);
        if (existing !== undefined && !def.equals(existing)) {
            throw this.error("Duplicate defines must be the same");
        }
        this.definitions.set(identifier.value, def);
    }

    private _undef(line: string) {
        line = mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = mustConsume(line, PreProRegex.identifier, "identifier");
        if (identifier.remainingLine.trim().length !== 0) throw this.error("Unexpected extra characters in undef");
        this.definitions.delete(identifier.value);
    }

    private _ifdef(line: string, ifdef: boolean, lines: string[]): string {
        line = mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = mustConsume(line, PreProRegex.identifier, "identifier");
        if (identifier.remainingLine.trim().length !== 0) throw this.error("Unexpected extra characters in ifdef");
        const condition = this.definitions.has(identifier.value) === ifdef;

        const ifBody: string[] = [], elseBody: string[] = [];
        let depth = 1, inElse = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();

            if (line.startsWith("#ifdef") || line.startsWith("#ifndef")) {
                depth++;

            } else if (line === "#endif") {
                depth--;
                if (depth === 0) {
                    // well formed ifdef
                    const body = condition ? ifBody : elseBody;
                    lines.splice(0, i + 1);
                    return this.process(body.join("\n"));
                }

            } else if (line === "#else" && depth === 1) {
                if (inElse) throw this.error("more than one #else statement");
                inElse = true;
                continue;

            }
            (inElse ? elseBody : ifBody).push(lines[i]);
        }

        throw this.error("no matching #endif found");
    }
}

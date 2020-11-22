import {LIBRARY_HEADERS} from "../c_library/standard_library";
import {ppEvaluate} from "./conditionals";
import {Definition} from "./definition";
import {PreProRegex, PreprocessorBase} from "./helpers";

export class Preprocessor extends PreprocessorBase {
    definitions = new Map<string, Definition>();

    libraryFiles: Map<string, string>; // #include <...>
    userFiles = new Map<string, string>(); // #include "..."

    constructor(readonly filename: string, standardHeaders: boolean = true) {
        super();
        if (standardHeaders) {
            this.libraryFiles = new Map<string, string>(LIBRARY_HEADERS);
        } else {
            this.libraryFiles = new Map<string, string>();
        }

        this.definitions.set("__FILE__", new Definition(this, "__FILE__", [{value: `"${filename}"`}], []));
    }

    process(text: string, filename: string = this.filename): string {
        // replace crlf with lf
        text = text.replace(/\r\n/g, "\n");
        // remove comments
        text = text.replace(PreProRegex.comments, " ");
        // remove line continuations
        const lines = text.replace(/\\\n/g, "").split("\n");

        let output = "";
        while (lines.length > 0) {
            const line = lines.shift() as string;

            if (line.startsWith("#")) {
                let match: ReturnType<typeof Preprocessor.prototype["consume"]>;
                if ((match = this.consume(line, "#define")).success) {
                    this._define(match.remainingLine);
                } else if ((match = this.consume(line, "#undef")).success) {
                    this._undef(match.remainingLine);
                } else if ((match = this.consume(line, "#include")).success) {
                    output += this._include(match.remainingLine) + "\n";
                } else if ((match = this.consume(line, "#ifdef")).success) {
                    this._ifdef(match.remainingLine, true, lines);
                } else if ((match = this.consume(line, "#ifndef")).success) {
                    this._ifdef(match.remainingLine, false, lines);
                } else if ((match = this.consume(line, "#if")).success) {
                    output += this._if(match.remainingLine, lines);
                } else if ((match = this.consume(line, "#pragma")).success) {
                    const l = this.mustConsume(match.remainingLine, PreProRegex.whitespace, "whitespace").remainingLine;
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
            const token = this.consumeAny(line);
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

    error(message: string): Error {
        return new class extends Error {
            name = "PreprocessorError";
        }(`In file '${this.filename}': ${message}`);
    }

    private _include(line: string): string {
        line = this.mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine.trim();
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
        const localPath = this.filename.replace(/[^/\\]*$/, path);
        let file = this.userFiles.get(localPath);
        if (file === undefined) {
            file = this.userFiles.get(path);
            if (file === undefined) return this._includeLib(path);
        }
        return this.process(file, path);
    }
    private _define(line: string) {
        line = this.mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = this.mustConsume(line, PreProRegex.identifier, "identifier");
        const tokens = [];
        const parameters: string[] = [];

        if (identifier.remainingLine.trim().length > 0) {
            if (identifier.remainingLine[0] === "(") {
                // definition with parameters
                line = this.mustConsume(identifier.remainingLine, "(").remainingLine;
                while (line.length > 0) {
                    line = this.consume(line, PreProRegex.whitespace).remainingLine;
                    const parameter = this.mustConsume(line, PreProRegex.identifier, "identifier");
                    parameters.push(parameter.value);
                    line = this.consume(parameter.remainingLine, PreProRegex.whitespace).remainingLine;

                    if (line.length === 0) {
                        throw this.error("Unexpected end of line");
                    } else if (line[0] === ",") {
                        line = this.mustConsume(line, ",").remainingLine;
                    } else if (line[0] === ")") {
                        break;
                    } else {
                        throw this.error("Unexpected");
                    }
                }
                line = this.mustConsume(line, ")").remainingLine;
                if (line.length > 0) {
                    line = this.mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
                }

            } else {
                // normal definition
                line = this.mustConsume(identifier.remainingLine, PreProRegex.whitespace, "whitespace").remainingLine;
            }

            // body
            while (line.length > 0) {
                const token = this.consumeAny(line);
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
        line = this.mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = this.mustConsume(line, PreProRegex.identifier, "identifier");
        if (identifier.remainingLine.trim().length !== 0) throw this.error("Unexpected extra characters in undef");
        this.definitions.delete(identifier.value);
    }

    private _ifdef(line: string, ifdef: boolean, lines: string[]) {
        line = this.mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        const identifier = this.mustConsume(line, PreProRegex.identifier, "identifier");
        lines.unshift(`#if ${ifdef ? "" : "!"} defined ${identifier.value}`);
    }

    private _if(line: string, lines: string[]): string {
        const expression = this.mustConsume(line, PreProRegex.whitespace, "whitespace").remainingLine;
        let condition = this._condition(expression), anyCondition = condition, depth = 1, hadElse = false;

        const body: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();

            if (line.startsWith("#if")) {
                depth++;

            } else if (line === "#endif") {
                depth--;
                if (depth === 0) {
                    // well formed ifdef
                    lines.splice(0, i + 1);
                    return this.process(body.join("\n"));
                }

            } else if (line === "#else" && depth === 1) {
                if (hadElse) throw this.error("more than one #else statement");
                hadElse = true;

                condition = !anyCondition;
                anyCondition = true;
                continue;
            } else if (line.startsWith("#elif") && depth === 1) {
                if (anyCondition) {
                    condition = false;
                } else {
                    const expression = this.mustConsume(lines[i].substring(5), PreProRegex.whitespace, "whitespace").remainingLine;
                    condition = this._condition(expression);
                    anyCondition ||= condition;
                }
                continue;
            }

            if (condition) body.push(lines[i]);
        }

        throw this.error("no matching #endif found");
    }

    private _condition(s: string): boolean {
        // deal with "defined ..."
        let processed = "";
        for (const match of s.matchAll(PreProRegex.condition)) {
            if (match.length !== 4) throw this.error("invalid regex result when processing #if condition");
            const definitionName = match[1] ?? match[2];
            if (definitionName) {
                processed += this.definitions.has(definitionName) ? " 1L " : " 0L ";
            } else {
                processed += match[3];
            }
        }
        // expand remaining macros
        processed = this.expandDefinitions(processed);
        // try evaluate
        try {
            return ppEvaluate(processed, this) !== 0n;
        } catch (e) {
            console.debug(e);
            throw this.error("Invalid condition `" + s + "`");
        }
    }
}

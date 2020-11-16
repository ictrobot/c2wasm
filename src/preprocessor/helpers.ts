// preprocessor tokens
export type Token = {
    type?: "identifier", // with optional type
    value: string
};

// various regexes used
export const PreProRegex = {
    identifier: /^[a-zA-Z_][a-zA-Z0-9_]*/,
    token: /^(?:"(?:\\"|[^\n"])*"|[^ \t\v\f\na-zA-Z_]+)/,
    definitionArgument: /^(?:"(?:\\"|[^\n"])*"|[^\n,")])*/, // allowed empty max(,) for max(a,b)
    whitespace: /^[ \t\v\f]+/,
    // used in first pass so is global and multiline
    comments: /(?:\/\*[^]*?\*\/)|(?:\/\/.*?$)/gm
};

// functions to 'consume' text from an input line
type ConsumeFailed = { success: false, remainingLine: string };
type ConsumeSucceeded = { success: true, remainingLine: string } & Token;

/** Consume identifier, token or whitespace */
export function consumeAny(line: string): ConsumeSucceeded {
    let match: ConsumeFailed | ConsumeSucceeded;
    if ((match = consume(line, PreProRegex.identifier)).success) {
        match.type = "identifier";
        return match;
    } else if ((match = consume(line, PreProRegex.token)).success) {
        return match;
    } else if ((match = consume(line, PreProRegex.whitespace)).success) {
        return match;
    }
    throw new Error("Malformed input? Line does not match defined regular expressions.\n`" + line + "`");
}

/** Consume or throw error */
export function mustConsume(line: string, t: RegExp | string, errorName: string = t.toString()): ConsumeSucceeded {
    const match = consume(line, t);
    if (match.success) return match;

    throw new Error(`Expected to find ${errorName} but found \`${line}\` instead`);
}

export function consume(line: string, t: RegExp | string): ConsumeFailed | ConsumeSucceeded {
    if (typeof t === "string") {
        if (line.startsWith(t)) {
            return {success: true, value: t, remainingLine: line.substring(t.length)};
        } else {
            return {success: false, remainingLine: line};
        }
    }

    const match = line.match(t);
    if (match === null) {
        return {success: false, remainingLine: line};
    }
    return {success: true, value: match[0], remainingLine: line.substring(match[0].length)};
}

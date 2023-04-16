import type {Location, ParseNode} from "./parsing";

export class CError extends Error {
    name = "CError";

    constructor(message: string, readonly node?: ParseNode, readonly node2?: ParseNode) {
        super(message);

        if (node?.loc) {
            this.message += "\n\n" + locationString(node.loc);
            if (node2?.loc) this.message += "\n\n" + locationString(node2.loc, "Secondary location");
        }
    }
}

export function locationString(loc: Location, label: string = "Location"): string {
    const lines = loc.source.split("\n");
    if (loc.first_line >= lines.length) return `${label}: [UNKNOWN]`;

    let output = `${label}:\n`;

    const lnumDigits = Math.ceil(Math.log10(loc.last_line + 4));
    function outputLine(lnum: number) {
        output += `L${(lnum + 1).toString().padStart(lnumDigits, '0')}: ${lines[lnum]}\n`;
    }

    if (loc.first_line > 1) outputLine(loc.first_line - 2);
    if (loc.first_line > 0) outputLine(loc.first_line - 1);
    outputLine(loc.first_line);

    // output ^^^ arrows
    output += new Array(3 + lnumDigits + loc.first_column).join(" ");
    if (loc.first_line === loc.last_line) {
        output += new Array(1 + loc.last_column - loc.first_column).join("^");
    } else {
        output += "^";
    }
    output += "\n";

    if (loc.first_line + 1 < lines.length) outputLine(loc.first_line + 1);
    if (loc.first_line + 2 < lines.length) outputLine(loc.first_line + 2);
    return output;
}

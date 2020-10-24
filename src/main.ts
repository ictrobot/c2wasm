import {parse} from "./parsing/parser";

const C_SOURCE = `
int main() {
   printf("Hello, World!");
   return 0;
}`

// temporary method to simplify the automatically created trees
// flattens arrays which only have one child
function simplifyTree(x: unknown): unknown {
    if (Array.isArray(x)) {
        return x.length === 1 && Array.isArray(x[0]) ? simplifyTree(x[0]) :  x.map(simplifyTree);
    }
    return x;
}

const result = parse(C_SOURCE);
const simplified = simplifyTree(result);

console.log(JSON.stringify(simplified, null, 4));

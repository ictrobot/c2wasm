import {parse} from "./parsing";

const C_SOURCE = `
int main() {
   printf("Hello, World!");
   return 0;
}`;

const result = parse(C_SOURCE);

console.log(JSON.stringify(result, function (key, value: any) {
    return key.startsWith("_") || key === "loc" ? undefined : value;
}, 4));

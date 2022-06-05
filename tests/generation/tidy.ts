import test from "ava";
import {compile, compileSnippet} from "../../src/compile";

test("empty module", t => {
    const bytes = compileSnippet('').toBytes();
    t.deepEqual([...bytes], [
        0x00, 0x61, 0x73, 0x6D, // magic
        0x01, 0x00, 0x00, 0x00, // version
        // no functions, exports, ssp, memory etc
    ]);
});

tidyTest("simple function", false, false, `
long factorial(unsigned int v) {
    return v < 2 ? 1 : v * factorial(v - 1);
}
`);

tidyTest("only memory", true, false, `
#include <stdio.h>
        
void main() {
    puts("Hello World");
}
`);

tidyTest("exported array argument", true, true, `
int sum(int arr[], int size) {
    int sum;
    for (int i = 0; i < size; i++) {
        sum += arr[i];
    }
    return sum;
}
`);

tidyTest("not exported array argument", true, false, `
static int sum(int arr[], int size) {
    int sum;
    for (int i = 0; i < size; i++) {
        sum += arr[i];
    }
    return sum;
}

int values[] = {1,2,3};

int main() {
    return sum(values, sizeof(values)/sizeof(int));
}
`);

function tidyTest(name: string, memIncluded: boolean, sspIncluded: boolean, source: string) {
    test(name, async t => {
        const {__mem, __sp} = await compile(source).execute({
            c2wasm: {
                __put_char: () => undefined // should never be called
            }
        }) as {
            __mem?: WebAssembly.Memory,
            __sp?: WebAssembly.Global,
        };

        t.is(__mem !== undefined, memIncluded, name + " mem");
        t.is(__sp !== undefined, sspIncluded, name + " sp");
    });
}

import test from "ava";
import {compile} from "../../src/compile";

test("function pointers", async t => {
    const values: number[] = [];

    const {main} = await compile(`
import void print(int a);

typedef int (*functionPtr)(int a, int b);

struct fnHolder {
  functionPtr f1;
  functionPtr f2;
};

int addInt(int n, int m) {
    return n+m;
}

int mulInt(int a, int b) {
    return a * b;
}

void main() {
    struct fnHolder x = {&addInt, mulInt};

    print(x.f1(1,2));
    print((*x.f1)(4,2));

    print(x.f2(1,2));
    print((*x.f2)(4,2));
}
    `).execute({
        c2wasm: {print: (x: number) => values.push(x)}
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(values, [3, 6, 2, 8]);
});

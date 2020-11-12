import test from "ava";
import {compile} from "../../src/generation";

loopTest("simple while loop", [0,1,2,3,4,5], `
void test() {
    int i = 0;
    while (i < 6) {
        log(i);
        i = i + 1;
    }
}
`);

loopTest("while with break", [0,1,2,3], `
void test() {
    int i = 0;
    while (i < 6) {
        log(i);
        i = i + 1;
        if (i > 3) break;
    }
}
`);

loopTest("while with continue", [0,1,2,4,5,6], `
void test() {
    int i = -1;
    while (i < 6) {
        i = i + 1;
        if (i == 3) continue;
        log(i);
    }
}
`);

loopTest("simple do loop", [1,2,3,4,5,6,7,8], `
void test() {
    int i = 0;
    do {
        i = i + 1;
        log(i);
    } while (i < 8);
}
`);

loopTest("do with break", [1,2,3,4], `
void test() {
    int i = 0;
    do {
        i = i + 1;
        if (i == 5) break;
        log(i);
    } while (i < 8);
}
`);

loopTest("do with continue", [1,3,5,7,9], `
void test() {
    int i = 0;
    do {
        i = i + 1;
        if (i % 2 == 0) continue;
        log(i);
    } while (i < 8);
}
`);

loopTest("simple for loop", [0,1,2,3,4,5,6,7,8,9], `
void test() {
    for (int i = 0; i < 10; i = i + 1) {
        log(i);
    }
}
`);

loopTest("for with break", [0,1,2,3,4,5,6,7], `
void test() {
    for (int i = 0; i < 10; i = i + 1) {
        if (i > 7) break;
        log(i);
    }
}
`);

loopTest("for with continue", [0,1,2,6,7,8,9], `
void test() {
    for (int i = 0; i < 10; i = i + 1) {
        if (i > 2 && i < 6) continue;
        log(i);
    }
}
`);

loopTest("for with nested break and continue", [0,1,2,5], `
void test() {
    for (int i = 0; i < 10; i = i + 1) {
        if (i > 2) {
            if (i < 5) continue;
            else if (i > 5) break;
        }
        log(i);
    }
}
`);

function loopTest<T>(name: string, expected: T[], cSource: string) {
    test(name, async t => {
        const values: T[] = [];

        const {test} = await compile("extern void log(int output);\n\n" + cSource).execute({
            extern: {
                log: (n: T) => values.push(n)
            }
        }) as {
            test: () => void
        };

        test();
        t.deepEqual(values, expected);
    });
}

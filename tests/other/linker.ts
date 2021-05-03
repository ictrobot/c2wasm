import test from "ava";
import {compile, stdLibrary} from "../../src/compile";
import {WGenerator} from "../../src/generation";
import {Linker} from "../../src/linker";

const standardLibraryTest = `
#include <stdlib.h>
#define NUM 21

import void log(long b);

void factorial(long* arr, int length) {
  for (int i = 0; i < length; i++) {
    arr[i] = i < 2 ? 1 : i * arr[i - 1];
  }
}

void main() {
  long* factArray = calloc(sizeof(long), NUM);
  factorial(factArray, NUM);
  for (int i = 0; i < 21; ++i) {
    log(factArray[i]);
  }
  free(factArray);
}`;

test("stdlib linking", async t => {
    const expected: bigint[] = [];
    for (let i = 0; i < 21; i++) expected.push(i < 2 ? 1n : BigInt(i) * expected[i - 1]);
    const values: bigint[] = [];

    const c = await compile(standardLibraryTest).execute({
        c2wasm: {
            log: (x: bigint) => values.push(x),
            __put_char: () => undefined
        }
    }) as {
        main: () => void
    };

    c.main();
    t.deepEqual(values, expected);
});

test("selective library linking", async t => {
    const map = new Map<string, string>();
    map.set("main.c", standardLibraryTest);
    let linker = new Linker(map);
    linker.link(stdLibrary());
    t.truthy(linker.emitFunctions.find(f => f.name === "malloc"));
    t.falsy(linker.emitFunctions.find(f => f.name === "printf"));

    map.set("main.c", `#include <stdio.h>\nvoid test() {&printf;}`);
    linker = new Linker(map);
    linker.link(stdLibrary());
    t.falsy(linker.emitFunctions.find(f => f.name === "malloc"));
    t.truthy(linker.emitFunctions.find(f => f.name === "printf"));
});

test("multiple files", async t => {
    const map = new Map<string, string>();
    map.set("test.h", `
int sharedValue;
void doubleValue(); 
`);
    map.set("main.c", `
#include "test.h"

import void log(int);

void main() {
  log(sharedValue);
  sharedValue = 5;
  log(sharedValue);
  doubleValue();
  log(sharedValue);
}`);
    map.set("test.c", `
#include "test.h"

void doubleValue() {
  sharedValue *= 2;
}    
`);

    const values: number[] = [];

    const {main} = await compile(map).execute({
        c2wasm: {
            log: (x: number) => values.push(x)
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(values, [0, 5, 10]);
});

test("multiple files with internal functions", async t => {
    const map = new Map<string, string>();
    map.set("test.h", `
int sharedValue;
void doTest(); 
`);
    map.set("main.c", `
#include "test.h"

import void log(int);

static void setupValue() {
  sharedValue = 5;
}

void main() {
  log(sharedValue);
  setupValue();
  log(sharedValue);
  doTest();
  log(sharedValue);
  doTest();
  log(sharedValue);
}`);
    map.set("test.c", `
#include "test.h"

static int setup = 0;
static void setupValue() {
  sharedValue = 100;
}

void doTest() {
  if (setup == 0) {
    setupValue();
    setup = 1;
  }
  sharedValue *= 2;
}    
`);

    const values: number[] = [];

    const {main} = await compile(map).execute({
        c2wasm: {
            log: (x: number) => values.push(x)
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(values, [0, 5, 200, 400]);
});

test("missing function", async t => {
    const map = new Map<string, string>();
    map.set("main.c", `
int* missingFn(int, long);

void main() {
}`);

    await t.throws(() => compile(map));
});

test("incompatible functions", async t => {
    const map = new Map<string, string>();
    map.set("main.c", `
void factorial(int);

void main() {
  factorial(3);
}`);
    map.set("factorial.c", `
long int factorial(unsigned int v) {
  return v < 2 ? 1 : v * factorial(v - 1);
}`);

    await t.throws(() => compile(map));
});

test("variable with one definition", async t => {
    const map = new Map<string, string>();
    map.set("main.c", `int x;`);
    map.set("test1.c", `int x;`);
    map.set("test2.c", `int x = 3;`);

    await t.notThrows(() => compile(map));
});

test("variable with multiple definitions", async t => {
    const map = new Map<string, string>();
    map.set("main.c", `int x = 2;`);
    map.set("test1.c", `int x;`);
    map.set("test2.c", `int x = 3;`);

    await t.throws(() => compile(map));
});

test("multiple fallback linkers", async t => {
    const map1 = new Map<string, string>();
    map1.set("a.c", `int add(int a, int b) { return a + b; }`);
    const l1 = new Linker(map1, false);
    l1.link();

    const map2 = new Map<string, string>();
    map2.set("b.c", `int mul(int a, int b) { return a * b; }`);
    const l2 = new Linker(map2, false);
    l2.link();

    const map3 = new Map<string, string>();
    map3.set("c.c", `
    int mul(int, int);
    int add(int, int);
    
    int main() { return mul(add(2, 4), 3); }
    `);
    const l3 = new Linker(map3, false);
    l3.link(l1, l2);

    const {main} = (await new WGenerator(l3).module.execute({})) as {main: () => number};
    t.is(main(), 18);
});

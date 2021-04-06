import test from "ava";
import {compileSnippet} from "../../src/compile";

test("struct copy", async t => {
    const c = await compileSnippet(`
        struct test{long padding; long padding2; int value;};

        int test() {
          struct test a = {123, 456, 42};
          struct test b = {33, 33, 33};
          b = a;
          a.value = 35;
          return b.value;
        }
    `).execute({}) as {
        test: () => number
    };

    t.is(c.test(), 42);
});

test("as parameter and return value", async t => {
    const values: number[] = [];

    const c = await compileSnippet(`
        import void print(int a, int b);

        struct pair{int a; int b;};
        
        struct pair doublePair(struct pair in) {
          struct pair out = {in.a * 2, in.b * 2};
          return out;
        }
        
        void main() {
          struct pair myPair = {42,57};
          myPair = doublePair(myPair);
          print(myPair.a, myPair.b);
        }
    `).execute({
        c2wasm: {
            print: (a: number, b: number) => values.push(a, b)
        }
    }) as {
        main: () => void
    };

    c.main();
    t.deepEqual(values, [84, 114]);
});

test("regression #1", async t => {
    /*
     * Calling a function with the results of other functions returning structs
     * on the stack cause them to overwrite each other
     */

    const c = await compileSnippet(`
        struct pos {int x, y;};
        
        struct pos get(int idx) {
          struct pos pos;
          pos.x = idx;
          pos.y = idx * 10;
          return pos;
        }
        
        int sum(struct pos a, struct pos b) {
          return a.x + a.y + b.x + b.y;
        }
        
        int main() {
          return sum(get(0), get(1));
        }
    `).execute({}) as {
        main: () => number
    };

    t.is(c.main(), 11); // returns 22 if broken
});

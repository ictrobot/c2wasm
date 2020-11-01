import test from "ava";
import {toIR} from "../src/tree";

test('const int* x', t => {
    t.truthy(toIR(`
        int main() {
           int a = 1, b = 2;
           const int* myPointer;
           myPointer = &a;
           myPointer = &b;
           return 0;
        }
    `));
    t.throws(() => toIR(`
        int main() {
           int a = 1;
           const int* myPointer = &a;
           *myPointer = 4;
           return 0;
        }
    `));
});

test('int *const x', t => {
    t.truthy(toIR(`
        int main() {
           int a = 1, b = 2;
           int *const myPointer = &b;
           *myPointer = a + b;
           *myPointer = 5;
           return 0;
        }
    `));
    t.throws(() => toIR(`
        int main() {
           int a = 1, b = 2;
           int *const myPointer = &b;
           myPointer = &a;
           return 0;
        }
    `));
});

test('const int x[]', t => {
    t.throws(() => toIR(`
        int main() {
           const int x[] = {1,2,3};
           x[0] = 34;
           return 0;
        }
    `));
});

test("struct with const member", t => {
    t.truthy(toIR(`
        struct T {
            const int x;
            int y;
        };
        
        int test() {
            struct T myT = {5, 3};
            myT.y = 5;
        }
    `));

    t.throws(() => toIR(`
        struct T {
            const int x;
            int y;
        };
        
        int test() {
            struct T myT = {5, 3};
            myT.x = 5;
        }
    `));

    t.throws(() => toIR(`
        struct T {
            const int x;
            int y;
        };
        
        int test() {
            struct T myT = {5, 3};
            struct T myS = {1, 2};
            myT = myS;
        }
    `));
});

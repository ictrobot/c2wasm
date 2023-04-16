import test from 'ava';
import {parse, ParseTreeValidationError} from "../src/parsing";

test('valid C decodes', t => {
    t.truthy(parse(`
        struct pair {
            int a;
            int b;
        };
    
        int main() {
           printf("Hello, World!");
           return 0;
        }
        
        int pairSum(struct pair myPair) {
            return myPair.a + myPair.b;
        }
    `));
});

test('invalid C raises an error', t => {
    t.throws(() => parse(`
        int main int a { return 0 }    
    `));
});

test('basic validation of specifiers', t => {
    t.throws(() => parse(`
        int double long x;
    `), {instanceOf: ParseTreeValidationError});
});

test("abstract function declarators", t => {
    t.truthy(parse(`
        int eval(int (*)(int), int);

        int eval(int (*f)(int), int x) {
          return f(x);
        }
        
        int triple(int x) {
          return x * 3;
        }
        
        int main() {
          return eval(triple, 10);
        }
    `));
});

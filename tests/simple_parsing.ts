import test from 'ava';
import {parse} from "../src/parsing/parser";

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
    `))
});

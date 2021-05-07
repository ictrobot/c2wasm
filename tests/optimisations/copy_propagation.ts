import {i32Type} from "../../src/wasm";
import {optimisationTest} from "./index";

optimisationTest("constant propagation", {
    copy_propagation: true,
    unused_locals: true
}, (t, withoutOpt, withOpt) => {

    t.deepEqual(withoutOpt.functions[0].locals, [i32Type]);
    t.deepEqual(withOpt.functions[0].locals, []);

}, `
import void f(int);

void main() {
  int size = 5;
  f(size);
  f(size + 1);
  
  size = 10;
  f(size);
}
`);

optimisationTest("copy propagation", {
    copy_propagation: true,
    unused_locals: true
}, (t, withoutOpt, withOpt) => {

    t.deepEqual(withoutOpt.functions[0].locals, [i32Type]);
    t.deepEqual(withOpt.functions[0].locals, []);

}, `
import void f(int);

void test(int x) {
  int size = x;
  f(size);
  f(size + 1);
}
`);

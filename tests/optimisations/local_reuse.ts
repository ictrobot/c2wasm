import {i32Type} from "../../src/wasm";
import {optimisationTest} from "./index";

// scoped reuse should happen regardless of separate reallocation pass
optimisationTest("scoped local reuse", {
    reallocate_locals: true,
    live_range_splitting: true
}, (t, withoutOpt, withOpt) => {

    t.is(withoutOpt.functions.length, 1);
    t.deepEqual(withoutOpt.functions[0].locals, [i32Type]);

    t.is(withOpt.functions.length, 1);
    t.deepEqual(withOpt.functions[0].locals, [i32Type]);
},`
    import void action(int a);
    
    void test() {
      for (int i = 0; i++; i < 10) {
        action(i);
      }
      for (int j = 0; j++; j < 10) {
        action(j);
      }
      
    }
`);

optimisationTest("live range splitting", {
    reallocate_locals: true,
    live_range_splitting: true
}, (t, withoutOpt, withOpt) => {

    t.is(withoutOpt.functions.length, 1);
    t.deepEqual(withoutOpt.functions[0].locals, [i32Type, i32Type, i32Type]);

    t.is(withOpt.functions.length, 1);
    t.deepEqual(withOpt.functions[0].locals, [i32Type, i32Type]);
},`
    import int f(int);
    import int g(int, int);
    
    void test() {
      int a,b,c;
      
      a = f(1);
      b = f(2);
      g(a, b);
      
      b = f(3);
      c = f(4);
      g(b, c);
      
      c = f(5);
      a = f(6);
      g(c, a);
    }
`);

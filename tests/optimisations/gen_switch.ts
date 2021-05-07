import {optimisationTest, countInstructions} from "./index";

optimisationTest("br_table flag", {
    generation_switch_br_table: true
}, (t, withoutOpt, withOpt) => {

    t.is(withoutOpt.functions.length, 1);
    t.is(countInstructions("br_if", withoutOpt.functions[0].body, true), 8);
    t.is(countInstructions("br", withoutOpt.functions[0].body, true), 1);
    t.is(countInstructions("br_table", withoutOpt.functions[0].body, true), 0);

    t.is(withOpt.functions.length, 1);
    t.is(countInstructions("br_if", withOpt.functions[0].body, true), 0);
    t.is(countInstructions("br", withOpt.functions[0].body, true), 0);
    t.is(countInstructions("br_table", withOpt.functions[0].body, true), 1);
},`
    int test(int x) {
      switch (x) {
        case 1:
        case 2:
        case 3:
          return 100;
        case 4:
          return 50;
        case 5:
          return 20;
        case 6:
         return 10;
        case 7:
        default:
          return 0;
        case 8:
          return 75;
      }
    }
`);

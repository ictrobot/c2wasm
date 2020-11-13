import test from "ava";
import {compile} from "../../src/generation";

test("list sum", async t => {
    const {test} = await compile(`
        struct List {
          int head;
          struct List *tail;
        };
        
        int listSum(struct List *list) {
          int sum = 0;
          while (list != 0) {
             sum += list->head;
             list = list->tail;
          }
          return sum;
        }
        
        int test() {
          struct List a = {5};
          struct List b = {123, &a};
          struct List c = {2, &b};
          return listSum(&c);
        }
    `).execute({}) as {
        test: () => number
    };

    t.is(test(), 130);
});

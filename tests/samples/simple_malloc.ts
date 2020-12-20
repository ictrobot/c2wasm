import test from "ava";
import {compileSnippet} from "../../src/compile";

test("simple malloc using __wasm__", async t => {
    const {main} = await compileSnippet(`
        static int mallocPointer = 1048576; 
        static const int PAGE_SIZE = 65536;
        
        static void* malloc(unsigned int bytes) {
          bytes += 4 - (bytes % 4);
          void* thisPointer = (void*) mallocPointer;
          mallocPointer += bytes;
        
          // grow memory if needed
          int currentPages = __wasm_i32__(0, 0x3F, 0x00); // memory.size
        
          if (mallocPointer > currentPages * PAGE_SIZE) {
            __wasm_i32__(1, 1 + (mallocPointer / PAGE_SIZE) - currentPages, 0x40, 0); // memory.grow
          }
          
          return thisPointer;
        }
        
        int main() {
          int* firstPointer = (int*) mallocPointer;
         
          for (int i = 0; i < 100; i++) {
            int* block = malloc(PAGE_SIZE / 3);
            for (int j = 0; j <= i; j++) {
              block[j] = j;
            }
          }
        
          int* lastPointer = (int*) mallocPointer;
          int sum = 0;
          for (int *i = firstPointer; i < lastPointer; i++) {
            sum += *i;
          }  
          return sum;
        }
    `).execute({}) as {
        main: () => number
    };

    let sum = 0;
    for (let i = 0; i < 100; i++) {
        for (let j = 0; j <= i; j++) sum += j;
    }

    t.is(main(), sum);
});

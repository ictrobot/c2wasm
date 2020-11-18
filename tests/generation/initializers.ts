import test from "ava";
import {compileSnippet} from "../../src/compile";

test("array initializer", async t => {
    const values: number[] = [];

    const {main} = await compileSnippet(`
        import void log(int a);
        
        void main() {
            int arr[] = {10, 7, 0, 8, 9, 1, -7, 5, 1234, 23};
            int length = sizeof(arr) / sizeof(int);
            for (int i = 0; i < length; i++) log(arr[i]);
        }
    `).execute({
        c2wasm: {
            log: (n: number) => values.push(n)
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(values, [10, 7, 0, 8, 9, 1, -7, 5, 1234, 23]);
});

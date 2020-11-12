import test from "ava";
import {compile} from "../../src/generation";

test("factorial", async t => {
    const values: number[] = [];

    const {main} = await compile(`
        extern void log(int a);

        static void swap(int *a, int *b) {
            int t = *a;
            *a = *b;
            *b = t;
        }
        
        static int partition(int *arr, int low, int high) {
            int pivot = arr[high];
            int i = low - 1;
        
            for (int j = low; j <= high - 1; j++) {
                if (arr[j] < pivot) {
                    i++;
                    swap(&arr[i], &arr[j]);
                }
            }
            
            swap(&arr[i + 1], &arr[high]);
            return i + 1;
        }
        
        static void quickSort(int *arr, int low, int high) {
            if (low < high) {
                int p = partition(arr, low, high);
                quickSort(arr, low, p - 1);
                quickSort(arr, p + 1, high);
            }
        }
        
        void main() {
            static int arr[] = {10, 7, 0, 8, 9, 1, -7, 5, 1234, 23};
            int length = sizeof(arr) / sizeof(arr[0]);
            quickSort(arr, 0, length - 1);
            for (int i = 0; i < length; i++) log(arr[i]);
        }
    `).execute({
        extern: {
            log: (n: number) => values.push(n)
        }
    }) as {
        main: () => void
    };

    main();
    t.deepEqual(values, [-7, 0, 1, 5, 7, 8, 9, 10, 23, 1234]);
});

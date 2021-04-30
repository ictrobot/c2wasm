import test from "ava";
import {compile} from "../../src";
import {Files, FileLike} from "../../src/c_library/runtime/files";

test("basic IO", async t => {
    const {main} = await compile(`
#include <stdio.h>
#include <stdbool.h>

bool check(char* filename) {
  FILE* f = fopen(filename, "r");
  int value = 0;
  fscanf(f, "Hello World%d\\n", &value);
  fclose(f);
  return value == 6;
}

int main() {
  FILE* f = fopen("text.txt", "w");
  fprintf(f, "Hello World6\\n");
  fclose(f);
  
  if (!check("text.txt")) return 1; 
  remove("text2.txt");
  rename("text.txt", "text2.txt");
  if (check("text.txt")) return 2; 
  if (!check("text2.txt")) return 3; 

  f = fopen("text2.txt", "r");
  fgetc(f);fgetc(f);fgetc(f);fgetc(f);
  fpos_t pos;
  fgetpos(f, &pos);
  if (pos != 4) return 5;
  rewind(f);
  if (fgetc(f) != 'H') return 6;
  fsetpos(f, &pos);
  if (fgetc(f) != 'o') return 7;

  fseek(f, -1, SEEK_END);
  fgetpos(f, &pos);
  if (pos != 12) return 8;

  remove("text2.txt");
  if (check("text2.txt")) return 9;
   
  return 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => c).getImports()
    }}) as {main: () => number};

    t.is(main(), 0);
});

test("custom file", async t => {
    const map = new Map<string, FileLike>();
    map.set("infinite", {
        get: () => "E".charCodeAt(0),
        put: () => false,
        set_pos: () => false,
        pos: () => 0n,
        len: () => 2n ** 31n
    });

    const {main} = await compile(`
#include <stdio.h>

int main() {
  FILE* f = fopen("infinite", "r");
  if (f == NULL) return -1;

  for (int i = 1; i <= 1000 * 1000; i++) {
    if (fgetc(f) != 'E') return i;
  }

  fclose(f);
  return 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => c, undefined, map).getImports()
    }}) as {main: () => number};

    t.is(main(), 0);
});

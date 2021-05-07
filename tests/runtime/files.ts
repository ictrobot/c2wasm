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

test("stdout", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>

int main() {
  printf("The answer is %d!", 42);
  
  return fgetc(stdout) >= 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => output += c).getImports()
    }}) as {main: () => number};

    t.is(main(), 0); // cannot read from stdout
    t.is(output, "The answer is 42!");
});

test("stderr", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>

int main() {
  fputs("ERROR!\\n", stderr);
  
  return fgetc(stderr) >= 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => output += c).getImports()
    }}) as {main: () => number};

    t.is(main(), 0); // cannot read from stderr
    t.is(output, "ERROR!\n");
});

test("stdin (not provided)", async t => {
    const {main} = await compile(`
#include <stdio.h>

int main() {
  return fgetc(stdin) >= 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => c).getImports()
    }}) as {main: () => number};

    t.is(main(), 0); // no stdin provided
});

test("stdin (provided)", async t => {
    let output = "";

    const {main} = await compile(`
#include <stdio.h>
#define n 100

char line[n];

int main() {
  fgets(line, n, stdin);
  printf("From stdin: %s", line);
   
  return fputc('E', stdin) >= 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => output += c, () => "Hello World\n").getImports()
    }}) as {main: () => number};

    t.is(main(), 0); // cannot write to stdin
    t.is(output, "From stdin: Hello World\n");
});

test("stdout pos/len", async t => {
    const {main} = await compile(`
#include <stdio.h>

int main() {
  fseek(stdout, -100, SEEK_END);
  
  fpos_t pos;
  fgetpos(stdout, &pos);
  if (pos != 0) return 1;
  
  pos = 100;
  if (fsetpos(stdout, &pos) == 0) return 2; 

  return 0;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...new Files((c) => c).getImports()
    }}) as {main: () => number};

    t.is(main(), 0);
});

test("updating file", async t => {
    const files = new Files((c) => c);

    const {main} = await compile(`
#include <stdio.h>
#define FILENAME "num.txt"

int main() {
  int counter = 0;

  FILE* r;
  if ((r = fopen(FILENAME, "r")) != NULL) {
    fscanf(r, "%d", &counter);
    fclose(r);

    printf("Counter was %d\\n", counter);
    printf("Incremented to %d\\n", ++counter);
  } else {
    printf("Failed to read file %s", FILENAME);
  }

  FILE* w = fopen(FILENAME, "w");
  fprintf(w, "%d", counter);
  fclose(r);

  return counter;
}
    `, {FILES: "1"}).execute({c2wasm: {
        ...files.getImports()
    }}) as {main: () => number};

    t.deepEqual([main(), main(), main(), main()], [0, 1, 2, 3]);
    t.deepEqual([main(), main(), main()], [4, 5, 6]);
    files.delete("num.txt");
    t.deepEqual([main(), main(), main()], [0, 1, 2]);
});

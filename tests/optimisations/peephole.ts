import test from "ava";
import {compileSnippet} from "../../src/compile";
import {optimisationTest, countInstructions} from "./index";

optimisationTest("peephole_local_tee", {
    peephole_local_tee: true
}, (t, withoutOpt, withOpt) => {
    const withoutInstrNames = withoutOpt.functions[0].body.instructions.map(x => x.name);
    const withInstrNames = withOpt.functions[0].body.instructions.map(x => x.name);

    t.deepEqual(withoutInstrNames, ["i32.const", "local.set", "local.get"]);
    t.deepEqual(withInstrNames, ["i32.const", "local.tee"]);
}, `
int test() {
    int a = 3;
    return a;
}
`);

optimisationTest("peephole_constants_add_mul", {
    peephole_constants_add_mul: true
}, (t, withoutOpt, withOpt) => {
    const withoutInstrNames = withoutOpt.functions[0].body.instructions.map(x => x.name);
    const withInstrNames = withOpt.functions[0].body.instructions.map(x => x.name);

    t.deepEqual(withoutInstrNames, ["local.get", "i32.const" /*0*/, "i32.const" /*4*/, "i32.mul", "i32.add", "i32.load"]);
    t.deepEqual(withInstrNames, ["local.get", "i32.const" /*0*/, "i32.add", "i32.load"]);
}, `
int getIdxZero(int* arr) {
  return arr[0];
}
`);

optimisationTest("peephole_add_0", {
    peephole_constants_add_mul: true,
    peephole_add_0: true
}, (t, withoutOpt, withOpt) => {
    const withoutInstrNames = withoutOpt.functions[0].body.instructions.map(x => x.name);
    const withInstrNames = withOpt.functions[0].body.instructions.map(x => x.name);

    t.deepEqual(withoutInstrNames, ["local.get", "i32.const" /*0*/, "i32.const" /*4*/, "i32.mul", "i32.add", "i32.load"]);
    t.deepEqual(withInstrNames, ["local.get", "i32.load"]);
}, `
int getIdxZero(int* arr) {
  return arr[0];
}
`);

optimisationTest("peephole_constant_if", {
    peephole_constant_if: true,
    peephole_unused_blocks: true
}, (t, withoutOpt, withOpt) => {
    const withoutInstrNames = withoutOpt.functions[0].body.instructions.map(x => x.name);
    const withInstrNames = withOpt.functions[0].body.instructions.map(x => x.name);

    t.deepEqual(withoutInstrNames, ["i32.const"/*1*/, "if"]);
    t.deepEqual(withInstrNames, /* if body */ ["i32.const"/* memAddr */, "call" /*0*/]);
}, `
import void print(char*);
#define DEBUG 1

void main() {
  if (DEBUG) print("DEBUG");
}
`);

optimisationTest("peephole_unused_blocks", {
    peephole_unused_blocks: true
}, (t, withoutOpt, withOpt) => {
    t.is(countInstructions("loop", withoutOpt.functions[0].body, true), 1);
    t.is(countInstructions("if", withoutOpt.functions[0].body, true), 1);
    t.is(countInstructions("block", withoutOpt.functions[0].body, true), 1);

    t.is(countInstructions("loop", withOpt.functions[0].body, true), 1);
    t.is(countInstructions("if", withOpt.functions[0].body, true), 1);
    t.is(countInstructions("block", withOpt.functions[0].body, true), 0);
}, `
import void f();

void main() {
  for (int i = 0; i < 10; i++) f();
}
`);

optimisationTest("i32.[op]", {
    // generation constant expression is disabled
    // check that each of these locals are folded to a single constant,
    // which is then propagated and collapsed by the 2nd peephole pass
    peephole_i32_constants_ops: true,
    copy_propagation: true,
    dead_code_elimination: true,
    unused_locals: true,
    peephole_2nd_pass: true
}, (t, withoutOpt, withOpt) => {
    t.is(withoutOpt.functions[0].locals.length, 23);

    t.is(withOpt.functions[0].locals.length, 0);
    t.is(withOpt.functions[0].body.instructions.length, 1);
}, `
    int main() {
      int eq = 1 == 2;
      int neq = 1 != 2;
      int lt_s = -1 < 2;
      int lt_u = 1u < 2u;
      int gt_s = 12 > -100;
      int gt_u = ((unsigned) -1) > 1;
      int le_s = -2 <= -4;
      int le_u = 2u <= 4u;
      int ge_s = 234 >= 121;
      int ge_u = 0x111u >= 16u;
      int add = 2 + 2;
      int sub = 4 - 100;
      int mul = 6 * 6;
      int div_s = 10 / 2;
      int div_u = 255u / 7u;
      int rem_s = 136 % 20;
      int rem_u = 122u % 8u;
      int and = 73 & 31;
      int or = 13 | 64;
      int xor = 21 ^ 56;
      int shl = 1 << 7;
      int shr_s = -100 >> 2;
      int shr_u = -100u >> 24;

      return eq + neq \\
        + lt_s + lt_u + gt_s + gt_u + le_s + le_u + ge_s + ge_u \\
        + add + sub + mul + div_s + div_u + rem_s + rem_u \\
        + and + or + xor + shl + shr_s + shr_u;
    }
`);

optimisationTest("load offset", {
    // check each function is optimised to local.get 0, [load] offset=64
    peephole_constants_add_mul: true,
    peephole_load_offset: true
}, (t, withoutOpt, withOpt) => {
    for (const f of withoutOpt.functions) {
        t.assert(f.body.instructions.some(x => x.name === "i32.add"));
    }

    for (const f of withOpt.functions) {
        t.is(f.body.instructions.length, 2);
        t.is(f.body.instructions[0].name, "local.get");
        t.like(f.body.instructions[1], {
            type: "memory",
            immediate: {
                offset: 64n
            }
        });
    }
}, `
signed char s8(signed char* ptr) {
  return ptr[64];
}

short s16(short* ptr) {
  return ptr[32];
}

int s32(int* ptr) {
  return ptr[16];
}

long s64(long* ptr) {
  return ptr[8];
}

char u8(char* ptr) {
  return ptr[64];
}

unsigned short u16(unsigned short* ptr) {
  return ptr[32];
}

unsigned int u32(unsigned int* ptr) {
  return ptr[16];
}

unsigned long u64(unsigned long* ptr) {
  return ptr[8];
}

float f32(float* ptr) {
  return ptr[16];
}

double f64(double* ptr) {
  return ptr[8];
}`);

// regression test for peephole_constant_if - check it doesn't completely remove constant if instructions which are
// branched too, which are generated when `break` is used inside a (constant condition) while loop.
test("peephole_constant_if regression1", async t => {
    const {test} = await compileSnippet(`
int test(int a) {
  while (1) {
    if (a >= 10) break;
    if (a >= 20) {
      // clearly this shouldn't happen - so there is a problem
      return -1;
    }
    a++;
  }
  return a;
}`).execute({}) as { test: (n: number) => number };

    t.is(test(1), 10);
    t.is(test(24), 24);
});

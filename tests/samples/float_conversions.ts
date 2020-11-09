import test from "ava";
import {compile} from "../../src/generation";

test("from float", async t => {
    const c = await compile(`
        unsigned char a() {
            return -12345.67f;
        }
        
        signed char b() {
            return -12345.67f;
        }
        
        unsigned short c() {
            return -12345.67f;
        }
        
        signed short d() {
            return -12345.67f;
        }
        
        unsigned int e() {
            return -12345.67f;
        }
        
        signed int f() {
            return -12345.67f;
        }
        
        unsigned long g() {
            return -12345.67f;
        }
        
        signed long h() {
            return -12345.67f;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 57);
    t.is(c.b(), -57);
    t.is(c.c(), 12345);
    t.is(c.d(), -12345);
    t.is(c.e(), 12345);
    t.is(c.f(), -12345);
    t.is(c.g(), 12345n);
    t.is(c.h(), -12345n);
});

test("from double", async t => {
    const c = await compile(`
        unsigned char a() {
            return -12345.67;
        }
        
        signed char b() {
            return -12345.67;
        }
        
        unsigned short c() {
            return -12345.67;
        }
        
        signed short d() {
            return -12345.67;
        }
        
        unsigned int e() {
            return -12345.67;
        }
        
        signed int f() {
            return -12345.67;
        }
        
        unsigned long g() {
            return -12345.67;
        }
        
        signed long h() {
            return -12345.67;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 57);
    t.is(c.b(), -57);
    t.is(c.c(), 12345);
    t.is(c.d(), -12345);
    t.is(c.e(), 12345);
    t.is(c.f(), -12345);
    t.is(c.g(), 12345n);
    t.is(c.h(), -12345n);
});

test("to float", async t => {
    const c = await compile(`
        float a() {
            return (unsigned char) -3;
        }
        
        float b() {
            return (signed char) -3;
        }
        
        float c() {
            return (unsigned short) -3;
        }
        
        float d() {
            return (signed short) -3;
        }
        
        float e() {
            return (unsigned int) -3;
        }
        
        float f() {
            return (signed int) -3;
        }
        
        float g() {
            return (unsigned long) -3;
        }
        
        float h() {
            return (signed long) -3;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 253);
    t.is(c.b(), -3);
    t.is(c.c(), 65533);
    t.is(c.d(), -3);
    t.is(c.e(), 4294967296);
    t.is(c.f(), -3);
    t.is(c.g(), 4294967296);
    t.is(c.h(), -3);
});

test("to double", async t => {
    const c = await compile(`
        double a() {
            return (unsigned char) -3;
        }
        
        double b() {
            return (signed char) -3;
        }
        
        double c() {
            return (unsigned short) -3;
        }
        
        double d() {
            return (signed short) -3;
        }
        
        double e() {
            return (unsigned int) -3;
        }
        
        double f() {
            return (signed int) -3;
        }
        
        double g() {
            return (unsigned long) -3;
        }
        
        double h() {
            return (signed long) -3;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 253);
    t.is(c.b(), -3);
    t.is(c.c(), 65533);
    t.is(c.d(), -3);
    t.is(c.e(), 4294967293);
    t.is(c.f(), -3);
    t.is(c.g(), 4294967293);
    t.is(c.h(), -3);
});

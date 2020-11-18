import test from "ava";
import {compileSnippet} from "../../src/compile";

test("narrowing conversions", async t => {
    const c = await compileSnippet(`
        unsigned char a() {
            return 12345;
        }
        
        signed char b() {
            return 12345;
        }
        
        unsigned char c() {
            return -12345;
        }
        
        signed char d() {
            return -12345;
        }
        
        unsigned short e() {
            return 78798;
        }
        
        signed short f() {
            return 78798;
        }
        
        unsigned short g() {
            return -78798;
        }
        
        signed short h() {
            return -78798;
        }
        
        unsigned int i() {
            return 124362144234234;
        }
        
        signed int j() {
            return 124362144234234;
        }
        
        signed long k() {
            return (unsigned int) -124362144234234;
        }
        
        signed long l() {
            return (signed int) -124362144234234;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 57);
    t.is(c.b(), 57);
    t.is(c.c(), 199);
    t.is(c.d(), -57);
    t.is(c.e(), 13262);
    t.is(c.f(), 13262);
    t.is(c.g(), 52274);
    t.is(c.h(), -13262);
    t.is(c.i(), 1366178554);
    t.is(c.j(), 1366178554);
    t.is(c.k(), 2928788742n);
    t.is(c.l(), -1366178554n);
});

test("widening signed value", async t => {
    const c = await compileSnippet(`
        unsigned char a() {
            return (signed char) 125;
        }
        
        signed char b() {
            return (signed char) 125;
        }
        
        unsigned char c() {
            return (signed char) -125;
        }
        
        signed char d() {
            return (signed char) -125;
        }
        
        unsigned short e() {
            return (signed char) 125;
        }
        
        signed short f() {
            return (signed char) 125;
        }
        
        unsigned short g() {
            return (signed char) -125;
        }
        
        signed short h() {
            return (signed char) -125;
        }
        
        unsigned int i() {
            return (signed char) 125;
        }
        
        signed int j() {
            return (signed char) 125;
        }
        
        unsigned int k() {
            return (signed char) -125;
        }
        
        signed int l() {
            return  (signed char) -125;
        }
        
        unsigned long m() {
            return (signed char) 125;
        }
        
        signed long n() {
            return (signed char) 125;
        }
        
        unsigned long o() {
            return (signed char) -125;
        }
        
        signed long p() {
            return (signed char) -125;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 125);
    t.is(c.b(), 125);
    t.is(c.c(), 131);
    t.is(c.d(), -125);
    t.is(c.e(), 125);
    t.is(c.f(), 125);
    t.is(c.g(), 65411);
    t.is(c.h(), -125);
    t.is(c.i(), 125);
    t.is(c.j(), 125);
    t.is(c.k(), -125);
    t.is(c.l(), -125);
    t.is(c.m(), 125n);
    t.is(c.n(), 125n);
    t.is(c.o(), 4294967171n);
    t.is(c.p(), -125n);
});

test("widening unsigned value", async t => {
    const c = await compileSnippet(`
        unsigned char a() {
            return (unsigned char) 200;
        }
        
        signed char b() {
            return (unsigned char) 200;
        }
        
        unsigned short c() {
            return (unsigned char) 200;
        }
        
        signed short d() {
            return (unsigned char) 200;
        }
        
        unsigned int e() {
            return (unsigned char) 200;
        }
        
        signed int f() {
            return (unsigned char) 200;
        }
        
        unsigned long g() {
            return (unsigned char) 200;
        }
        
        signed long h() {
            return (unsigned char) 200;
        }
    `).execute({}) as {
        [s: string]: () => number | bigint
    };

    t.is(c.a(), 200);
    t.is(c.b(), -56);
    t.is(c.c(), 200);
    t.is(c.d(), 200);
    t.is(c.e(), 200);
    t.is(c.f(), 200);
    t.is(c.g(), 200n);
    t.is(c.h(), 200n);
});

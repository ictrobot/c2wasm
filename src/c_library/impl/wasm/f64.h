#pragma once

#define f64_abs(x)          (__wasm_f64__(1, (double) x, 0x99))
#define f64_neg(x)          (__wasm_f64__(1, (double) x, 0x9A))
#define f64_ceil(x)         (__wasm_f64__(1, (double) x, 0x9B))
#define f64_floor(x)        (__wasm_f64__(1, (double) x, 0x9C))
#define f64_trunc(x)        (__wasm_f64__(1, (double) x, 0x9D))
#define f64_nearest(x)      (__wasm_f64__(1, (double) x, 0x9E))
#define f64_sqrt(x)         (__wasm_f64__(1, (double) x, 0x9F))

#define f64_min(x,y)        (__wasm_f64__(2, (double) x, (double) y, 0xA4))
#define f64_max(x,y)        (__wasm_f64__(2, (double) x, (double) y, 0xA5))
#define f64_copysign(x,y)   (__wasm_f64__(2, (double) x, (double) y, 0xA6))

#pragma once

#define f32_abs(x)          (__wasm_push__(1, (float) x), __wasm_f32__(0x8B))
#define f32_neg(x)          (__wasm_push__(1, (float) x), __wasm_f32__(0x8C))
#define f32_ceil(x)         (__wasm_push__(1, (float) x), __wasm_f32__(0x8D))
#define f32_floor(x)        (__wasm_push__(1, (float) x), __wasm_f32__(0x8E))
#define f32_trunc(x)        (__wasm_push__(1, (float) x), __wasm_f32__(0x8F))
#define f32_nearest(x)      (__wasm_push__(1, (float) x), __wasm_f32__(0x90))
#define f32_sqrt(x)         (__wasm_push__(1, (float) x), __wasm_f32__(0x91))

#define f32_min(x,y)        (__wasm_push__(2, (float) x, (float) y), __wasm_f32__(0x96))
#define f32_max(x,y)        (__wasm_push__(2, (float) x, (float) y), __wasm_f32__(0x97))
#define f32_copysign(x,y)   (__wasm_push__(2, (float) x, (float) y), __wasm_f32__(0x98))

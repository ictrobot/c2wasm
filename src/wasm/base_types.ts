// use explicit type guards to enable typing and help prevent mistakes possible when using `number` for everything

export type byte = number & { __type_byte__: void };

// technically only u64/s64 need to be stored as bigints, however all ints as bigints makes it easier to
// do arithmetic on any type of integer and avoids having to write it once for ints and once for bigints.
export type u32 = bigint & { __type_u32__: void };

export type u64 = bigint & { __type_u64__: void };
export type i32 = bigint & { __type_s32__: void };
export type i64 = bigint & { __type_s64__: void };
export type f32 = number & { __type_f32__: void };
export type f64 = number & { __type_f64__: void };


// indices
export type typeidx = u32 & { __type_idx__: void };
export type funcidx = u32 & { __func_idx__: void };
export type globalidx = u32 & { __global_idx__: void };
export type localidx = u32 & { __local_idx__: void };
export type labelidx = u32 & { __label_idx__: void };

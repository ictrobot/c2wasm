// use explicit type guards to enable typing and help prevent mistakes possible when using `number` for everything

export type byte = number & { __type_byte__: void };

// indices
type u32 = bigint & { __type_u32__: void };
export type typeidx = u32 & { __type_idx__: void };
export type funcidx = u32 & { __func_idx__: void };
export type globalidx = u32 & { __global_idx__: void };
export type localidx = u32 & { __local_idx__: void };
export type labelidx = u32 & { __label_idx__: void };

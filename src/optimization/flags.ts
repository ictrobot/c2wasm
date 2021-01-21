const DEFAULT = {
    generation_try_constant_expr: true,
    generation_zero_shadow_stack: false,
    generation_switch_br_table: false,

    peephole_local_tee: true,
    peephole_constants_add_mul: true,
    peephole_add_0: true,
    peephole_combine_adds: true,
    peephole_constant_if: true,
    peephole_unused_blocks: true,

    partial_redundancy_elimination: true,
    copy_propagation: true,
    dead_code_elimination: true,
    unused_locals: true,

    peephole_2nd_pass: true,
} as const;

export type OptimizationFlags = {[k in keyof typeof DEFAULT]: boolean};

let current: OptimizationFlags = DEFAULT;

export function setFlags(flags: Partial<OptimizationFlags> | "none" | "default"): void {
    if (typeof flags === "object") {
        current = {...current, ...flags};
    } else if (flags === "default") {
        current = DEFAULT;
    } else if (flags === "none") {
        current = {...current, ...Object.fromEntries(Object.keys(DEFAULT).map(name => [name, false]))};
    }
}

export function getFlags(): OptimizationFlags {
    return current;
}

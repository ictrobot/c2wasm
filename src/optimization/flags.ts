const DEFAULT = {
    generation_try_constant_expr: true,

    peephole_local_tee: true,
    peephole_mul: true,
    peephole_add_0: true,
    peephole_combine_adds: true,
    peephole_remove_blocks: true
} as const;

export type OptimizationFlags = {[k in keyof typeof DEFAULT]: boolean};

let current: OptimizationFlags = DEFAULT;

export function setFlags(flags: Partial<OptimizationFlags>): void {
    current = {...current, ...flags};
}

export function getFlags(): OptimizationFlags {
    return current;
}

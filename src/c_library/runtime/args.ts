export function injectArgs(instance: WebAssembly.Exports, args: string[]): [number, number] {
    if (!(instance.__sp instanceof WebAssembly.Global) || typeof instance.__sp.value !== "number") {
        throw new Error("Needs __sp global export");
    }
    const pos = instance.__sp.value as number;
    if (!(instance.__mem instanceof WebAssembly.Memory)) {
        throw new Error("Needs __mem export");
    }
    const mem = instance.__mem;
    const array = new Uint8Array(mem.buffer);
    const encoder = new TextEncoder();

    // need 4 * (len + 1) bytes for the string pointers and then a null pointer
    let pointerAddr = pos, stringAddr = pos + (4 * (args.length + 1));
    for (let i = 0; i < args.length; i++) {
        // inject pointer to char[]
        array.set(encodeInt(stringAddr), pointerAddr);
        pointerAddr += 4;

        // inject char[]
        const stringBytes = [...encoder.encode(args[i]), 0]; // null terminate string
        array.set(stringBytes, stringAddr);
        stringAddr += stringBytes.length;
    }
    // inject null pointer
    array.set([0,0,0,0], pointerAddr);

    // update stack pointer
    stringAddr += 32; // padding
    instance.__sp.value = Math.ceil(stringAddr / 4) * 4;

    return [args.length, pos];
}

function encodeInt(num: number) {
    const arr = new ArrayBuffer(4);
    new DataView(arr).setUint32(0, num, true);
    return new Uint8Array(arr);
}

export function mainWrapper(instance: WebAssembly.Exports, args: string[]): number | bigint | void {
    if ((instance.main as Function).length > 0) {
        const [argc, argv] = injectArgs(instance, args);
        return (instance as {main: (argc: number, argv: number) => number | bigint | void}).main(argc, argv);
    } else {
        return (instance as {main: () => number | bigint | void}).main();
    }
}

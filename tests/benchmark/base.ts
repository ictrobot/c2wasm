import {exec} from "child_process";
import {setFlags, getFlags, OptimisationFlags} from "../../src/optimisation/flags";

const FLAG_NAMES = Object.keys(getFlags()) as (keyof OptimisationFlags)[];

export type OptLevel = `-O${'0' | '1' | '2' | '3' | 's'}`;

export abstract class BenchmarkBase {

    constructor(readonly name: string, readonly benchmarkFile: string) {
    }

    abstract getScore(output: string): number;

    abstract c2wasmRun(): Promise<string>;

    abstract c2wasmSize(): Promise<number>;

    c2wasmNodeFlagsRun(nodeFlags: string): Promise<string> {
        const cmd = `node ${nodeFlags} -r ts-node/register ${this.benchmarkFile} ${BenchmarkBase.flagString()}`;

        return new Promise((resolve, reject) => exec(cmd, (error, stdout, stderr) => {
            if (error || stderr) {
                console.log(error || stderr);
                reject(new Error("Failed to spawn a child node instance"));
            }
            resolve(stdout.trim());
        }));
    }

    // called once, before any run calls with the same OptLevel
    abstract emccCompile?(optimisationLevel: OptLevel): Promise<void>;
    abstract emccRun?(optimisationLevel: OptLevel, nodeFlags: string): Promise<string>;
    abstract emccSize?(optimisationLevel: OptLevel): Promise<number>;

    abstract nativeCompile?(optimisationLevel: OptLevel): Promise<void>;
    abstract nativeRun?(optimisationLevel: OptLevel): Promise<string>;

    static flagString(): string {
        const flags = getFlags();
        let output = "";
        for (const f of FLAG_NAMES) output += flags[f] ? "T" : "F";
        return output;
    }

    static setFlags(flagString: string | undefined): void {
        if (!flagString || flagString === "default") {
            setFlags("default");
        } else if (flagString === "none") {
            setFlags("none");
        } else if (flagString.length === FLAG_NAMES.length && flagString.match(/^[TF]*$/)) {
            const flags: {-readonly[T in keyof OptimisationFlags]?: boolean} = {};
            for (const [i, f] of FLAG_NAMES.entries()) {
                flags[f] = flagString[i] === "T";
            }
            setFlags(flags);
        } else {
            throw new Error("Invalid flag string '" + flagString + "'");
        }
    }

    static cmdStdout(command: string): Promise<string> {
        let cmd = `/bin/bash -c '${command}'`;
        if (process.platform.startsWith("win")) { // try run through WSL
            cmd = `wsl -- ${cmd.replace(/(\$)/g, '$1')}`;
        }

        return new Promise((resolve, reject) => exec(cmd, {cwd: __dirname}, (error, stdout, stderr) => {
            if (error || stderr) {
                console.log(error || stderr);
                reject(error || stderr);
            }
            resolve(stdout.trim());
        }));
    }
}

// c2wasm flag configurations
export const FLAG_CONFIGURATIONS = new Map<string, Parameters<typeof setFlags>[0]>();

FLAG_CONFIGURATIONS.set("NONE", "none");

setFlags("none");
setFlags({generation_try_constant_expr: true});
FLAG_CONFIGURATIONS.set("TRY CONST", getFlags());

setFlags("default");
setFlags({partial_redundancy_elimination: false, copy_propagation: false, reallocate_locals: false});
FLAG_CONFIGURATIONS.set("NO PRE/CP/RL", getFlags());

setFlags("default");
setFlags({partial_redundancy_elimination: false});
FLAG_CONFIGURATIONS.set("NO PRE", getFlags());

FLAG_CONFIGURATIONS.set("DEFAULT", "default");

setFlags("default");
setFlags({inlining: true});
FLAG_CONFIGURATIONS.set("INLINE", getFlags());

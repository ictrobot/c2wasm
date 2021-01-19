export class Files {
    private nextHandle = 1000;
    private handleMap = new Map<number, FileLike>();
    private nameMap = new Map<string, number>();
    private fileNameBuffer = "";

    constructor(output: (char: string) => void, input?: () => string, files?: Map<string, Uint8Array | FileLike>) {
        // handle 0 - stdin
        if (input) {
            const currentInput: number[] = [];
            this.setupIoHandle(0, () => {
                if (currentInput.length === 0) currentInput.push(...new TextEncoder().encode(input() ?? ""));
                if (currentInput.length === 0) return -1;
                return currentInput.shift() ?? -1;
            }, () => false);
        } else {
            this.setupIoHandle(0, () => -1, () => false);
        }

        // handle 1 - stdout
        this.setupIoHandle(1, () => -1, (c: number) => {
            output(String.fromCharCode(c));
            return true;
        });

        // handle 2 - stderr
        this.setupIoHandle(2, () => -1, (c: number) => {
            output(String.fromCharCode(c));
            return true;
        });

        // handle 3 - filenames
        this.setupIoHandle(3, () => -1, (c: number) => {
            this.fileNameBuffer += String.fromCharCode(c);
            return true;
        });

        if (files) {
            for (const [fname, contents] of files.entries()) {
                let file;
                if (contents instanceof Uint8Array) {
                    file = new File();
                    file.bytes = [...contents];
                } else {
                    file = contents;
                }
                this.handleMap.set(this.nextHandle, file);
                this.nameMap.set(fname, this.nextHandle++);
            }
        }
    }

    private setupIoHandle(handle: number, get: () => number | -1, put: (c: number) => boolean) {
        this.handleMap.set(handle, {
            get, put,
            pos: () => 0n,
            len: () => 0n,
            set_pos: () => false
        });
    }

    private getFilenames(n = 1): string[] {
        const filenames = this.fileNameBuffer.split('\0');
        if (filenames.pop() !== "" || filenames.length !== n) {
            throw new Error("Error in files wrapper");
        }
        this.fileNameBuffer = "";
        return filenames;
    }

    // imports

    private __get_char(handle: number): number {
        return this.handleMap.get(handle)?.get() ?? -1;
    }

    private __put_char(handle: number, char: number): number {
        const file = this.handleMap.get(handle);
        if (file) return file.put(char as number) ? 0 : -1;
        return -1;
    }

    private __get_pos(handle: number): bigint {
        return this.handleMap.get(handle)?.pos() ?? -1n;
    }

    private __get_len(handle: number): bigint {
        return this.handleMap.get(handle)?.len() ?? -1n;
    }

    private __set_pos(handle: number, pos: bigint): number {
        const file = this.handleMap.get(handle);
        if (file) return file.set_pos(pos) ? 0 : -1;
        return -1;
    }

    private __exists(): number {
        const [filename] = this.getFilenames();
        return this.nameMap.has(filename) ? 1 : 0;
    }

    private __move(): number {
        const [oldName, newName] = this.getFilenames(2);
        const handle = this.nameMap.get(oldName);
        if (handle !== undefined) {
            if (newName === "") {
                // deleting file
                this.nameMap.delete(oldName);
                this.handleMap.delete(handle);
                return 0; // success
            } else if (!this.nameMap.has(newName)) {
                // moving file
                this.nameMap.delete(oldName);
                this.nameMap.set(newName, handle);
                return 0;
            }
        }
        return -1; // failure
    }

    private __get_fhandle(): number {
        const [filename] = this.getFilenames();
        let handle = this.nameMap.get(filename);
        if (handle === undefined) {
            // create a new file
            handle = this.nextHandle++;
            this.nameMap.set(filename, handle);
            this.handleMap.set(handle, new File());
        }
        // reset position
        this.handleMap.get(handle)?.set_pos(0n);

        return handle;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public getImports() {
        return {
            __get_char: this.__get_char.bind(this),
            __put_char: this.__put_char.bind(this),
            __get_pos: this.__get_pos.bind(this),
            __get_len: this.__get_len.bind(this),
            __set_pos: this.__set_pos.bind(this),
            __exists: this.__exists.bind(this),
            __move: this.__move.bind(this),
            __get_fhandle: this.__get_fhandle.bind(this)
        };
    }

    public getContents(filename: string): Uint8Array | undefined {
        const file = this.handleMap.get(this.nameMap.get(filename) ?? -Infinity);
        if (file instanceof File) return new Uint8Array(file.bytes);
    }
}

interface FileLike {
    get(): number | -1;
    put(c: number): boolean;
    pos(): bigint;
    len(): bigint;
    set_pos(pos: bigint): boolean;
}

class File implements FileLike {
    private _bytes: number[] = [];
    private _pos = 0n;

    get(): number | -1 {
        if (this._pos >= this._bytes.length) return -1;
        const b = this._bytes[Number(this._pos)];
        this._pos++;
        return b;
    }

    put(c: number): boolean {
        this._bytes[Number(this._pos)] = c;
        this._pos++;
        return true;
    }

    pos(): bigint {
        return this._pos;
    }

    len(): bigint {
        return BigInt(this._bytes.length);
    }

    set_pos(pos: bigint): boolean {
        if (pos < 0 || pos > this._bytes.length) return false;
        this._pos = pos;
        return true;
    }

    get bytes(): number[] {
        return this._bytes;
    }

    set bytes(value: number[]) {
        this._bytes = value;
        this._pos = 0n;
    }
}

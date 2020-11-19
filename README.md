# c2wasm

## Features
Compiles most of c89 excluding goto, nested typedefs, function pointers and with reduced standard library support.

Also supports the following c99 features:
- Declarations anywhere inside blocks
- `_Bool` / `stdbool.h`
- `stdint.h` 

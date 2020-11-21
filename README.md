# c2wasm

[Compiler demo](https://ictrobot.github.io/c2wasm/)

Other demos:
- [preprocessor](https://ictrobot.github.io/c2wasm/preprocessor.html)
- [parse tree](https://ictrobot.github.io/c2wasm/parsetree.html)
- [intermediate representation](https://ictrobot.github.io/c2wasm/ctree.html)

## Features
Compiles most of c89 excluding goto, nested typedefs and with reduced standard library support.

Also supports the following c99 features:
- Declarations anywhere inside blocks
- `_Bool` / `stdbool.h`
- `stdint.h` 

## License
[MIT License](/LICENSE).

Files in `src/c_library/impl/libraries` have their own licenses inside each folder.

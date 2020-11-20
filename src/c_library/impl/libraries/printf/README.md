Original: https://github.com/mpaland/printf

Commit used: `d3b984684bb8a8bdc48cc7a1abecb93ce59bbe3e`

License: MIT

Files:
- `printf.c` small modifications:
    - changed included header
    - changed `#if defined(...)` to `#ifdef ...`
    - removed `inline` specifiers
    - changed the one instance of `unsigned` to `unsigned int`
    - remove underscores from the end of function names
- `printf.h` modified

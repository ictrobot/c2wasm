#pragma once

typedef char *va_list;

// va arguments are located just below the shadow stack pointer
#define va_start(ap, parmN) ( ap = (char*) __wasm_ssp__() )
// each one is 8 bytes apart
// have to use __wasm_rload__ to take into account structs and unions being stored as pointers not their actual values
#define va_arg(ap, T) ( ap -= 8, *((T*) __wasm_rload__((T *) ap)) )

#define va_copy(dst, src) ( dst = src )
// not needed
#define va_end(ap) "va_end"

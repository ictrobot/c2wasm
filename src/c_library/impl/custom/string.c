#include <string.h>

char* strcpy(char* destination, const char* source) {
    memcpy(destination, source, strlen(source) + 1); // + 1 to include null terminator
    return destination;
}

char* strncpy(char* destination, const char* source, size_t n) {
    const size_t len = strnlen(source, n);

    if (len < n) {
        // copy `len` and pad rest with 0s
        memcpy(destination, source, len);
        memset(destination + len, 0, n - len);
    } else {
        memcpy(destination, source, n);
    }
    return destination;
}

void* memcpy(void* destination, const void* source, size_t n) {
    __wasm_push__(3, destination, source, n);
    __wasm__(0xFC, 0x0A, 0, 0);
    return destination;
}

void* memset(void* destination, int c, size_t n) {
    __wasm_push__(3, destination, c, n);
    __wasm__(0xFC, 0x0B, 0);
    return destination;
}


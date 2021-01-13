#include <stdlib.h>

// stubs
void abort() {
    __wasm__(0, 0x00);
}

void exit(int code) {
    __wasm__(0, 0x00);
}

int atexit(void (*fcn)(void)) {
    return 1;
}

int system(const char *s) {
    return s == NULL ? 0 : 1;
}

char *getenv(const char *name) {
    return NULL;
}

// implementations
double atof(const char *s) {
    return strtod(s, (char**) NULL);
}

int atoi(const char *s) {
    return (int) strtol(s, (char**) NULL, 10);
}

int atol(const char *s) {
    return strtol(s, (char**) NULL, 10);
}

int abs(int n) {
    return n >= 0 ? n : -n;
}

int labs(long n) {
    return n >= 0 ? n : -n;
}

div_t div(int num, int denom) {
    div_t result;
    result.quot = num / denom;
    result.rem = num % denom;
    return result;
}

ldiv_t ldiv(long num, long denom) {
    ldiv_t result;
    result.quot = num / denom;
    result.rem = num % denom;
    return result;
}

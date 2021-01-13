#pragma once
#include <stddef.h>
#include <stdarg.h>

// from custom/alloc.c
void* malloc(size_t size);
void free(void* ptr);
void* realloc(void* ptr, size_t size);
void* calloc(size_t nobj, size_t size);

// custom/stdlib.c stubs
void abort(void);
void exit(int code);
int atexit(void (*fcn)(void));
int system(const char *s);
char *getenv(const char *name);

// avrlibc
double strtod(const char *s, char **endp);
long strtol(const char *s, char **endp, int base);
unsigned long strtoul(const char *s, char **endp, int base);
void *bsearch(const void * key, const void * base, size_t nmemb, size_t size, int (*cmp)(const void *, const void *));
void qsort(void * base, size_t nmemb, size_t size, int (*cmp)(const void *, const void *));

// custom/stdlib.c implementations
typedef struct __sdiv_t{
  int quot, rem;
} div_t;

typedef struct __ldiv_t {
  long quot, rem;
} ldiv_t;

double atof(const char *s);
int atoi(const char *s);
int atol(const char *s);
int abs(int n);
int labs(long n);
div_t div(int num, int denom);
ldiv_t ldiv(long num, long denom);

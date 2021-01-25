#pragma once
#include <stddef.h>
#include <stdarg.h>

// from libraries/printf
int printf(const char* format, ...);
int sprintf(char* buffer, const char* format, ...);
int snprintf(char* buffer, size_t count, const char* format, ...);
int vsnprintf(char* buffer, size_t count, const char* format, va_list va);
int vprintf(const char* format, va_list va);
int fctprintf(void (*out)(char character, void* arg), void* arg, const char* format, ...);

// from stdlib/stdio.c
int putchar(int chr);
int puts(const char *s);

//#define FILES
#ifndef FILES
// Output a character
import void __put_char(char);

#else
import int __get_char(int handle);
import int __put_char(int handle, int c);
import long __get_pos(int handle);
import long __get_len(int handle);
import int __set_pos(int handle, long pos);
import int __exists();
import int __move();
import int __get_fhandle();

// File support
typedef struct __stdio_file {
    int handle, unget, len;
    _Bool error, eof;
} FILE;
typedef long fpos_t;

FILE *fopen(const char *filename, const char *mode);
FILE *freopen(const char *filename, const char *mode, FILE* stream);
int fflush(FILE* stream);
int fclose(FILE* stream);
int remove(const char *filename);
int rename(const char *oldname, const char *newname);
char *tmpnam(char *s);
FILE *tmpfile(void);
int setvbuf(FILE *stream, char *buf, int mode, size_t size);
void setbuf(FILE *stream, char *buf);

// printf functions
int fprintf(FILE *stream, const char *format, ...);
// scanf functions
int vfscanf(FILE *stream, const char *fmt, va_list ap);
int fscanf(FILE *stream, const char *fmt, ...);
int scanf(const char *fmt, ...);

int fgetc(FILE *stream);
char *fgets(char *s, int n, FILE *stream);
int fputc(int c, FILE *stream);
int fputs(const char *s, FILE *stream);
#define getc(s) fgetc(s)
int getchar(void);
char *gets(char *s);
#define putc(c, s) fputc(c, s)
int putchar(int c);
int puts(const char *s);
int ungetc(int c, FILE *stream);

size_t fread(void *ptr, size_t size, size_t nobj, FILE *stream);
size_t fwrite(const void *ptr, size_t size, size_t nobj, FILE* stream);

int fseek(FILE *stream, long offset, int origin);
long ftell(FILE *stream);
void rewind(FILE *stream);
int fgetpos(FILE *stream, fpos_t *ptr);
int fsetpos(FILE *stream, const fpos_t *ptr);

void clearerr(FILE *stream);
int feof(FILE *stream);
int ferror(FILE *stream);
void perror(const char *s);

#define EOF -1
#define BUFSIZ 16
#define FILENAME_MAX 2048
#define FOPEN_MAX 1073741824
#define _IONBF 0
#define _IOLBF 1
#define _IOFBF 2
#define L_tmpnam 32
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
#define TMP_MAX 1073741824

extern FILE *stdin, *stdout, *stderr;

#endif

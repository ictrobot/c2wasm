#include <stdio.h>

#ifndef FILES
int putchar(int chr) {
   __put_char(chr);
   return chr;
}

int puts(const char *s) {
    char *x = s;
    while (*x) {
        __put_char(*x);
        x++;
    }
    __put_char('\n');
    return 0;
}

#else
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

// fake file support

#define __fhandle_stdin 0
#define __fhandle_stdout 1
#define __fhandle_stderr 2
#define __fhandle_fname 3

static FILE __stdin = {__fhandle_stdin, -1, false, false};
FILE* stdin = &__stdin;
static FILE __stdout = {__fhandle_stdout, -1, false, false};
FILE* stdout = &__stdout;
static FILE __stderr = {__fhandle_stderr, -1, false, false};
FILE* stderr = &__stderr;

#define __fhandle_flag_str 1

static void store_fname(const char *s) {
    char *x = s;
    while (*x) {
        __put_char(__fhandle_fname, *x);
        x++;
    }
    __put_char(__fhandle_fname, 0);
}

FILE *fopen(const char *filename, const char *mode) {
    return freopen(filename, mode, NULL);
}

FILE *freopen(const char *filename, const char *mode, FILE* stream) {
    store_fname(filename);
    if (!__exists() && strchr(mode, 'r')) {
        return NULL;
    }

    if (stream == NULL) {
        stream = malloc(sizeof(struct __stdio_file));
    }

    store_fname(filename);
    stream->handle = __get_fhandle();
    stream->unget = -1;
    stream->len = 0;
    stream->flags = 0;
    stream->error = false;
    stream->eof = false;

    if (strchr(mode, 'a')) {
        fseek(stream, 0, SEEK_END);
    }

    return stream;
}

void __str2file(FILE *stream, const char *data) {
    stream->handle = (int) data;
    stream->unget = -1;
    stream->len = 0;
    stream->flags = __fhandle_flag_str;
    stream->error = false;
    stream->eof = false;
}

int fflush(FILE* stream) {
    return 0; // no op
}

int fclose(FILE* stream) {
    free(stream);
    return 0;
}

int remove(const char *filename) {
    return rename(filename, "");
}

int rename(const char *oldname, const char *newname) {
    store_fname(oldname);
    store_fname(newname);
    return __move();
}

static char __tmpnam[L_tmpnam];
static int __tmpcount;
char *tmpnam(char *s) {
    if (s == NULL) s = __tmpnam;
    snprintf(s, L_tmpnam, "$tmp/%d", ++__tmpcount);
    return s;
}

FILE *tmpfile(void) {
    return fopen(tmpnam(NULL), "wb+");
}

int setvbuf(FILE *stream, char *buf, int mode, size_t size) {
    return -1; // no-op
}

void setbuf(FILE *stream, char *buf) {
    // no-op
}



int fgetc(FILE *stream) {
    int c;
    if (stream->unget >= 0) {
        c = (unsigned char) stream->unget;
        stream->unget = -1;
    } else if (stream->flags & __fhandle_flag_str) {
        char* s = (char*) stream->handle;
        c = *(s++);
        if (c) {
            stream->handle = (int) s;
        } else {
            stream->eof = true;
            c = EOF;
        }
        stream->error = false;
        stream->len++;
    } else {
        c = __get_char(stream->handle);
        stream->eof = c == EOF;
        stream->error = c < 0 && c != EOF;
        stream->len++;
    }
    return c;
}

char *fgets(char *s, int n, FILE *stream) {
    int i = 0;
    while (i < n - 1) {
        int c = fgetc(stream);
        if (c < 0) return NULL;
        s[i++] = c;
        if (c == '\n') break;
    }
    s[i] = 0;
    return s;
}

int fputc(int c, FILE *stream) {
    if (stream->flags & __fhandle_flag_str) return EOF;
    int result = __put_char(stream->handle, c);
    if (result >= 0) return c;
    return result;
}

int fputs(const char *s, FILE *stream) {
    if (stream->flags & __fhandle_flag_str) return EOF;

    char *x = s;
    while (*x) {
        if (__put_char(stream->handle, *x) < 0) return EOF;
        x++;
    }
    return 0;
}

int getchar(void) {
    return fgetc(stdin);
}

char *gets(char *s) {
    while (true) {
        int c = fgetc(stdin);
        if (c == '\n') {
            *s = 0;
            return s;
        } else if (c < 0) {
            break;
        } else {
            *s = c;
        }
        s++;
    }
    return NULL;
}

int putchar(int c) {
    return fputc(c, stdout);
}

int puts(const char *s) {
    if (fputs(s, stdout) < 0) return EOF;
    if (fputc('\n', stdout) < 0) return EOF;
    return 0;
}

int ungetc(int c, FILE *stream) {
    if (c < 0 || stream->unget >= 0) return EOF;
    stream->unget = c;
    return c;
}




size_t fread(void *ptr, size_t size, size_t nobj, FILE *stream) {
    int n;
    for (n = 0; n < nobj; n++) {
        for (int i = 0; i < size; i++) {
            int c = fgetc(stream);
            if (c < 0) return n;
            ((char*) ptr)[(n * size) + i] = c;
        }
    }
    return n;
}

size_t fwrite(const void *ptr, size_t size, size_t nobj, FILE* stream) {
    int n;
    for (n = 0; n < nobj; n++) {
        for (int i = 0; i < size; i++) {
            if (fputc(((char*) ptr)[(n * size) + i], stream) < 0) {
                return n;
            }
        }
    }
    return n;
}



int fseek(FILE *stream, long offset, int origin) {
    if (stream->flags & __fhandle_flag_str) return -1;

    long pos;
    if (origin == SEEK_SET) {
        pos = offset;
    } else if (origin == SEEK_CUR) {
        pos = __get_pos(stream->handle) + offset;
    } else if (origin == SEEK_END) {
        pos = __get_len(stream->handle) + offset;
    } else {
        return -1;
    }
    return fsetpos(stream, &pos);
}

long ftell(FILE *stream) {
    if (stream->flags & __fhandle_flag_str) return -1;

    long pos = __get_pos(stream->handle);
    if (pos < 0) return -1;
    return pos;
}

void rewind(FILE *stream) {
    fseek(stream, 0L, SEEK_SET);
    clearerr(stream);
}

int fgetpos(FILE *stream, fpos_t *ptr) {
    if (stream->flags & __fhandle_flag_str) return -1;

    long pos = __get_pos(stream->handle);
    if (pos < 0) return -1;
    *ptr = pos;
    return 0;
}

int fsetpos(FILE *stream, const fpos_t *ptr) {
    if (stream->flags & __fhandle_flag_str || __set_pos(stream->handle, *ptr) != 0) {
        return -1;
    }
    return 0;
}



void clearerr(FILE *stream) {
    stream->eof = false;
    stream->error = false;
}

int feof(FILE *stream) {
    return stream->eof;
}

int ferror(FILE *stream) {
    return stream->error;
}

void perror(const char *s) {
    fputs(s, stderr);
    fputs(": error\n", stderr);
}



int fscanf(FILE *stream, const char *fmt, ...) {
	va_list va;
	va_start(va, fmt);
	int result = vfscanf(stream, fmt, va);
	va_end(va);

	return result;
}

int scanf(const char *fmt, ...) {
	va_list va;
	va_start(va, fmt);
	int result = vfscanf(stdin, fmt, va);
	va_end(va);

	return result;
}

int sscanf(char *s, const char *fmt, ...) {
    FILE f;
    __str2file(&f, s);

    va_list va;
    va_start(va, fmt);
    int result = vfscanf(&f, fmt, va);
    va_end(va);

    return result;
}

#endif

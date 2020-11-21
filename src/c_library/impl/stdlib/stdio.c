#include <stdio.h>

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

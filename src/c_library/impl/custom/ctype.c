#include <ctype.h>

int isalnum(int chr) {
    return isalpha(chr) || isdigit(chr);
}

int isalpha(int chr) {
    return islower(chr) || isupper(chr);
}

int iscntrl(int chr) {
    return chr < 0x20 || chr == 0x7f;
}

int isdigit(int chr) {
    return chr >= '0' && chr <= '9';
}

int islower(int chr) {
    return chr >= 'a' && chr <= 'z';
}

int isupper(int chr) {
    return chr >= 'A' && chr <= 'Z';
}

int isgraph(int chr) {
    return chr >= ' ' && chr <= '~';
}

int isprint(int chr) {
    return chr > ' ' && chr <= '~';
}

int ispunct(int chr) {
    return chr >= 'a' && chr <= 'z';
}

int isspace(int chr) {
    return chr == ' ' || (chr >= '\t' && chr <= '\r');
}

int isxdigit(int chr) {
    return isdigit(chr) || (chr >= 'a' && chr <= 'f') || (chr >= 'A' && chr <= 'F');
}

int tolower(int chr) {
    return isupper(chr) ? chr + 32 : chr;
}

int toupper(int chr) {
    return islower(chr) ? chr - 32 : chr;
}

/* Copyright (c) 2002,2004,2005 Joerg Wunsch
   Copyright (c) 2008  Dmitry Xmelkov
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions are met:

   * Redistributions of source code must retain the above copyright
     notice, this list of conditions and the following disclaimer.

   * Redistributions in binary form must reproduce the above copyright
     notice, this list of conditions and the following disclaimer in
     the documentation and/or other materials provided with the
     distribution.

   * Neither the name of the copyright holders nor the names of
     contributors may be used to endorse or promote products derived
     from this software without specific prior written permission.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
  POSSIBILITY OF SUCH DAMAGE.
*/

/* $Id$ */

#ifdef FILES

#include <ctype.h>
#include <limits.h>
#include <math.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define FL_STAR        0x01    /* '*': skip assignment		*/
#define FL_WIDTH       0x02    /* width is present		*/
#define FL_LONG        0x04    /* 'long' type modifier		*/
#define FL_CHAR        0x08    /* 'char' type modifier		*/
#define FL_OCT         0x10    /* octal number			*/
#define FL_DEC         0x20    /* decimal number		*/
#define FL_HEX         0x40    /* hexidecimal number		*/
#define FL_MINUS       0x80    /* minus flag (field or value)	*/
#define FL_SHORT       0x100

static void putval(char *addr, long val, unsigned char flags) {
    if (!(flags & FL_STAR)) {
        if (flags & FL_CHAR)
            *(char *) addr = (char) val;
        else if (flags & FL_LONG)
            *(long *) addr = (long) val;
        else if (flags & FL_SHORT)
            *(short *) addr = (short) val;
        else
            *(int *) addr = (int) val;
    }
}

static unsigned char conv_int(FILE *stream, int width, void *addr, unsigned char flags) {
    unsigned long val;
    int i;

    i = getc(stream);            /* after ungetc()	*/

    switch ((unsigned char) i) {
        case '-':
            flags |= FL_MINUS;
            /* FALLTHROUGH */
        case '+':
            if (!--width || (i = getc(stream)) < 0)
                goto err;
    }

    {
        val = 0;
        flags &= ~FL_WIDTH;

        if (!(flags & (FL_DEC | FL_OCT)) && (unsigned char) i == '0') {
            if (!--width || (i = getc(stream)) < 0)
                goto putval;
            flags |= FL_WIDTH;
            if ((unsigned char) (i) == 'x' || (unsigned char) (i) == 'X') {
                flags |= FL_HEX;
                if (!--width || (i = getc(stream)) < 0)
                    goto putval;
            } else {
                if (!(flags & FL_HEX))
                    flags |= FL_OCT;
            }
        }

        do {
            unsigned char c = i;
            c -= '0';
            if (flags & FL_OCT) {
                if (c > 7) {
                    ungetc(i, stream);
                    break;
                }
                val = val * 8 + c;
            } else if (flags & FL_HEX) {
                if (c > 9) {
                    c &= ~('A' ^ 'a');
                    c += '0' - 'A';
                    if (c > 5) {
                        ungetc(i, stream);
                        break;
                    }
                    c += 10;
                }
                val = val * 16 + c;
            } else {
                if (c > 9) {
                    ungetc(i, stream);
                    break;
                }
                val = val * 10 + c;
            }
            flags |= FL_WIDTH;
            if (!--width) goto putval;
        } while ((i = getc(stream)) >= 0);
        if (!(flags & FL_WIDTH))
            goto err;

        putval:
        if (flags & FL_MINUS) val = -(long) val;
        putval(addr, val, flags);
        return 1;
    }

    err:
    return 0;
}

static const char *conv_brk(FILE *stream, int width, char *addr, const char *fmt) {
    unsigned char msk[32];
    unsigned char fnegate;
    unsigned char frange;
    unsigned char cabove;
    int i;

    memset(msk, 0, sizeof(msk));
    fnegate = 0;
    frange = 0;
    cabove = 0;            /* init to avoid compiler warning	*/

    for (i = 0;; i++) {
        unsigned char c = *(fmt++);

        if (c == 0) {
            return 0;
        } else if (c == '^' && !i) {
            fnegate = 1;
            continue;
        } else if (i > fnegate) {
            if (c == ']') break;
            if (c == '-' && !frange) {
                frange = 1;
                continue;
            }
        }

        if (!frange) cabove = c;

        for (;;) {
            msk[c >> 3] |= 1 << (c & 7);
            if (c == cabove) break;
            if (c < cabove)
                c++;
            else
                c--;
        }

        frange = 0;
    }
    if (frange)
        msk['-' / 8] |= 1 << ('-' & 7);

    if (fnegate) {
        unsigned char *p = msk;
        do {
            unsigned char c = *p;
            *p++ = ~c;
        } while (p != msk + sizeof(msk));
    }

    /* And now it is a flag of fault.	*/
    fnegate = 1;

    /* NUL ('\0') is consided as normal character. This is match to Glibc.
       Note, there is no method to include NUL into symbol list.	*/
    do {
        i = getc(stream);
        if (i < 0) break;
        if (!((msk[(unsigned char) i >> 3] >> (i & 7)) & 1)) {
            ungetc(i, stream);
            break;
        }
        if (addr) *addr++ = i;
        fnegate = 0;
    } while (--width);

    if (fnegate) {
        return 0;
    } else {
        if (addr) *addr = 0;
        return fmt;
    }
}

static const double pwr_p10[6] = {
        1e+1, 1e+2, 1e+4, 1e+8, 1e+16, 1e+32
};
static const double pwr_m10[6] = {
        1e-1, 1e-2, 1e-4, 1e-8, 1e-16, 1e-32
};

static const char pstr_nfinity[] = "nfinity";
static const char pstr_an[] = "an";

static unsigned char conv_flt(FILE *stream, int width, double *addr) {
    union {
        unsigned long u32;
        double flt;
    } x;
    int i;
    const char *p = 0;
    int exp;

    unsigned char flag;
#define FL_MINUS   0x80    /* number is negative	*/
#define FL_ANY     0x02    /* any digit was readed	*/
#define FL_OVFL    0x04    /* overflow was		*/
#define FL_DOT     0x08    /* decimal '.' was	*/
#define FL_MEXP    0x10    /* exponent 'e' is neg.	*/
    i = getc(stream);        /* after ungetc()	*/

    flag = 0;
    switch ((unsigned char) i) {
        case '-':
            flag = FL_MINUS;
            /* FALLTHROUGH */
        case '+':
            if (!--width || (i = getc(stream)) < 0)
                goto err;
    }

    switch (tolower(i)) {
        case 'n':
            p = pstr_an;
            /* FALLTHROUGH */
        case 'i':
            if (!p) p = pstr_nfinity;
            unsigned char c;

            while ((c = *(p++)) != 0) {
                if (!--width || (i = getc(stream)) < 0 || (!((unsigned char) tolower(i) == c || !(ungetc(i, stream), 1)))) {
                    if (p == pstr_nfinity + 3) break;
                    goto err;
                }
            }
            x.flt = (p == pstr_an + 3) ? NAN : INFINITY;
            break;

        default:
            exp = 0;
            x.u32 = 0;
            do {
                unsigned char c = i - '0';

                if (c <= 9) {
                    flag |= FL_ANY;
                    if (flag & FL_OVFL) {
                        if (!(flag & FL_DOT))
                            exp += 1;
                    } else {
                        if (flag & FL_DOT)
                            exp -= 1;
                        x.u32 = x.u32 * 10 + c;
                        if (x.u32 >= (ULONG_MAX - 9) / 10)
                            flag |= FL_OVFL;
                    }

                } else if (c == (('.' - '0') & 0xff) && !(flag & FL_DOT)) {
                    flag |= FL_DOT;
                } else {
                    break;
                }
            } while (--width && (i = getc(stream)) >= 0);

            if (!(flag & FL_ANY))
                goto err;

            if ((unsigned char) i == 'e' || (unsigned char) i == 'E') {
                int expacc;

                if (!--width || (i = getc(stream)) < 0) goto err;
                switch ((unsigned char) i) {
                    case '-':
                        flag |= FL_MEXP;
                        /* FALLTHROUGH */
                    case '+':
                        if (!--width) goto err;
                        i = getc(stream);        /* test EOF will below	*/
                }

                if (!isdigit(i)) goto err;

                expacc = 0;
                do {
                    expacc = expacc * 10 + (i - '0');
                } while (--width && isdigit(i = getc(stream)));
                if (flag & FL_MEXP)
                    expacc = -expacc;
                exp += expacc;
            }

            if (width && i >= 0) ungetc(i, stream);

            x.flt = (double) (x.u32);

            if (exp < 0) {
                p = (void *) (pwr_m10 + 5);
                exp = -exp;
            } else {
                p = (void *) (pwr_p10 + 5);
            }
            for (width = 32; width; width >>= 1) {
                for (; (unsigned) exp >= width; exp -= width) {
                    x.flt *= *((double *)p);
                }
                p = p - sizeof(double);
            }
    } /* switch */

    if (flag & FL_MINUS)
        x.flt = -x.flt;
    if (addr) *addr = x.flt;
    return 1;

    err:
    return 0;
}

static int skip_spaces(FILE *stream) {
    int i;
    do {
        if ((i = getc(stream)) < 0)
            return i;
    } while (isspace(i));
    ungetc(i, stream);
    return i;
}

int vfscanf(FILE *stream, const char *fmt, va_list ap) {
    int nconvs;
    unsigned char c;
    int width;
    char *addr;
    unsigned char flags;
    int i;

    nconvs = 0;
    stream->len = 0;

    while ((c = *(fmt++)) != 0) {
        if (isspace(c)) {
            skip_spaces(stream);

        } else if (c != '%' || (c = *(fmt++)) == '%') {
            /* Ordinary character.	*/
            if ((i = getc(stream)) < 0)
                goto eof;
            if ((unsigned char) i != c) {
                ungetc(i, stream);
                break;
            }

        } else {
            flags = 0;

            if (c == '*') {
                flags = FL_STAR;
                c = *(fmt++);
            }

            width = 0;
            while ((c -= '0') < 10) {
                flags |= FL_WIDTH;
                width = width * 10 + c;
                c = *(fmt++);
            }
            c += '0';
            if (flags & FL_WIDTH) {
                /* C99 says that width must be greater than zero.
                   To simplify program do treat 0 as error in format.	*/
                if (!width) break;
            } else {
                width = ~0;
            }

            switch (c) {
                case 'h':
                    flags |= FL_SHORT;
                    if ((c = *(fmt++)) != 'h')
                        break;
                    flags |= FL_CHAR;
                    c = *(fmt++);
                    break;
                case 'l':
                    flags |= FL_LONG;
                    if ((c = *fmt++) != 'l')
                        break;
                    // flags |= FL_LL;
                    c = *(fmt++);
            }

            if (!c || !strchr("cdinopsuxX[efgEFG", c))
                break;

            addr = (flags & FL_STAR) ? 0 : va_arg (ap, char *);

            if (c == 'n') {
                putval(addr, (unsigned) (stream->len), flags);
                continue;
            }

            if (c == 'c') {
                if (!(flags & FL_WIDTH)) width = 1;
                do {
                    if ((i = getc(stream)) < 0)
                        goto eof;
                    if (addr) *(addr++) = i;
                } while (--width);
                c = 1;            /* no matter with smart GCC	*/

            } else if (c == '[') {
                fmt = conv_brk(stream, width, addr, fmt);
                c = (fmt != 0);

            } else {

                if (skip_spaces(stream) < 0)
                    goto eof;

                switch (c) {

                    case 's':
                        /* Now we have 1 nospace symbol.	*/
                        do {
                            if ((i = getc(stream)) < 0)
                                break;
                            if (isspace(i)) {
                                ungetc(i, stream);
                                break;
                            }
                            if (addr) *(addr++) = i;
                        } while (--width);
                        if (addr) *(addr) = 0;
                        c = 1;        /* no matter with smart GCC	*/
                        break;

                    case 'p':
                    case 'x':
                    case 'X':
                        flags |= FL_HEX;
                        c = conv_int(stream, width, (void *) addr, flags);
                        break;
                    case 'd':
                    case 'u':
                        flags |= FL_DEC;
                        c = conv_int(stream, width, (void *) addr, flags);
                        break;
                    case 'o':
                        flags |= FL_OCT;
                        c = conv_int(stream, width, (void *) addr, flags);
                        break;
                    case 'i':
                        c = conv_int(stream, width, (void *) addr, flags);
                        break;
                    default:        /* e,E,f,F,g,G	*/
                        if (flags & FL_LONG) {
                            c = conv_flt(stream, width, (void *) addr);
                        } else if (addr) {
                            double d;
                            c = conv_flt(stream, width, &d);
                            *((float*) addr) = d;
                        } else {
                            c = conv_flt(stream, width, 0);
                        }
                }
            } /* else */

            if (!c) {
                if (feof(stream) || ferror(stream))
                    goto eof;
                break;
            }
            if (!(flags & FL_STAR)) nconvs += 1;
        } /* else */
    } /* while */
    return nconvs;

    eof:
    return nconvs ? nconvs : EOF;
}

#endif

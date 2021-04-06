#include <time.h>

clock_t clock() {
    return __time();
}

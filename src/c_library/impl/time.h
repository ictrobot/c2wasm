#pragma once
#include <stddef.h>

import double __time();

typedef double clock_t;
clock_t clock();
#define CLOCKS_PER_SEC 1000

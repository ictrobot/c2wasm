#pragma once

#define NULL ((void *) 0)
#define offsetof(st, m) ((size_t)&(((st *)0)->m))

#ifndef __type_size
#define __type_size
typedef unsigned int size_t;
#endif
#ifndef __type_ptrdiff
#define __type_ptrdiff
typedef signed long ptrdiff_t;
#endif

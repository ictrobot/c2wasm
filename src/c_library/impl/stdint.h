#pragma once

// exact-width integer types
#ifndef __type_int8
#define __type_int8
typedef signed char int8_t;
#define INT8_MAX 127
#define INT8_MIN -128
#endif

#ifndef __type_uint8
#define __type_uint8
typedef unsigned char uint8_t;
#define UINT8_MAX 255
#endif

#ifndef __type_int16
#define __type_int16
typedef signed short int16_t;
#define INT16_MAX 32767
#define INT16_MIN -32768
#endif

#ifndef __type_uint16
#define __type_uint16
typedef unsigned short uint16_t;
#define UINT16_MAX 65535
#endif

#ifndef __type_int32
#define __type_int32
typedef signed int int32_t;
#define INT32_MAX 2147483647
#define INT32_MIN -2147483648
#endif

#ifndef __type_uint32
#define __type_uint32
typedef unsigned int uint32_t;
#define UINT32_MAX 4294967295
#endif

#ifndef __type_int64
#define __type_int64
typedef signed long int64_t;
#define INT64_MAX 9223372036854775807
#define INT64_MIN -9223372036854775808
#endif

#ifndef __type_uint64
#define __type_uint64
typedef unsigned long uint64_t;
#define UINT64_MAX 18446744073709551615
#endif

// minimum-width integer types
#ifndef __type_int_least8
#define __type_int_least8
typedef signed char int_least8_t;
#define INT_LEAST8_MAX 127
#define INT_LEAST8_MIN -128
#endif

#ifndef __type_uint_least8
#define __type_uint_least8
typedef unsigned char uint_least8_t;
#define UINT_LEAST8_MAX 255
#endif

#ifndef __type_int_least16
#define __type_int_least16
typedef signed short int_least16_t;
#define INT_LEAST16_MAX 32767
#define INT_LEAST16_MIN -32768
#endif

#ifndef __type_uint_least16
#define __type_uint_least16
typedef unsigned short uint_least16_t;
#define UINT_LEAST16_MAX 65535
#endif

#ifndef __type_int_least32
#define __type_int_least32
typedef signed int int_least32_t;
#define INT_LEAST32_MAX 2147483647
#define INT_LEAST32_MIN -2147483648
#endif

#ifndef __type_uint_least32
#define __type_uint_least32
typedef unsigned int uint_least32_t;
#define UINT_LEAST32_MAX 4294967295
#endif

#ifndef __type_int_least64
#define __type_int_least64
typedef signed long int_least64_t;
#define INT_LEAST64_MAX 9223372036854775807
#define INT_LEAST64_MIN -9223372036854775808
#endif

#ifndef __type_uint_least64
#define __type_uint_least64
typedef unsigned long uint_least64_t;
#define UINT_LEAST64_MAX 18446744073709551615
#endif

// fastest minimum-width types
#ifndef __type_int_fast8
#define __type_int_fast8
typedef signed int int_fast8_t;
#define INT_FAST8_MAX 2147483647
#define INT_FAST8_MIN -2147483648
#endif

#ifndef __type_uint_fast8
#define __type_uint_fast8
typedef unsigned int uint_fast8_t;
#define UINT_FAST8_MAX 4294967295
#endif

#ifndef __type_int_fast16
#define __type_int_fast16
typedef signed int int_fast16_t;
#define INT_FAST16_MAX 2147483647
#define INT_FAST16_MIN -2147483648
#endif

#ifndef __type_uint_fast16
#define __type_uint_fast16
typedef unsigned int uint_fast16_t;
#define UINT_FAST16_MAX 4294967295
#endif

#ifndef __type_int_fast32
#define __type_int_fast32
typedef signed int int_fast32_t;
#define INT_FAST32_MAX 2147483647
#define INT_FAST32_MIN -2147483648
#endif

#ifndef __type_uint_fast32
#define __type_uint_fast32
typedef unsigned int uint_fast32_t;
#define UINT_FAST32_MAX 4294967295
#endif

#ifndef __type_int_fast64
#define __type_int_fast64
typedef signed long int_fast64_t;
#define INT_FAST64_MAX 9223372036854775807
#define INT_FAST64_MIN -9223372036854775808
#endif

#ifndef __type_uint_fast64
#define __type_uint_fast64
typedef unsigned long uint_fast64_t;
#define UINT_FAST64_MAX 18446744073709551615
#endif

// integers wide enough to hold pointers
#ifndef __type_intptr
#define __type_intptr
typedef signed int intptr_t;
#define INTPTR_MAX 2147483647
#define INTPTR_MIN -2147483648
#endif

#ifndef __type_uintptr
#define __type_uintptr
typedef unsigned int uintptr_t;
#define UINTPTR_MAX 4294967295
#endif

// greatest-width integer types
#ifndef __type_intmax
#define __type_intmax
typedef signed int intmax_t;
#define INTMAX_MAX 9223372036854775807
#define INTMAX_MIN -9223372036854775808
#endif

#ifndef __type_uintmax
#define __type_uintmax
typedef unsigned int uintmax_t;
#define UINTMAX_MAX 18446744073709551615
#endif

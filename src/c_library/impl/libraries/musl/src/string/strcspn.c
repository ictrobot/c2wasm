#include <string.h>

#define BITOP(a,b,op) \
 ((a)[(size_t)(b)/(8*sizeof *(a))] op (size_t)1<<((size_t)(b)%(8*sizeof *(a))))

char *__strchrnul(const char *s, int c);

size_t strcspn(const char *s, const char *c)
{
	const char *a = s;
	size_t byteset[8]; // 32/sizeof(size_t)

	if (!c[0] || !c[1]) return (size_t) (__strchrnul(s, *c)-a);

	memset(byteset, 0, sizeof byteset);
	for (; *c && BITOP(byteset, *(unsigned char *)c, |=); c++);
	for (; *s && !BITOP(byteset, *(unsigned char *)s, &); s++);
	return (size_t) (s-a);
}

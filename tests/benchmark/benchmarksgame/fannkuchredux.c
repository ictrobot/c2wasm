// FROM: https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-gcc-1.html
// 3-Clause BSD

#include <stdio.h>
#include <stdlib.h>

#define N 12

inline static int max(int a, int b)
{
    return a > b ? a : b;
}

int fannkuchredux()
{
    int perm[N];
    int perm1[N];
    int count[N];
    int maxFlipsCount = 0;
    int permCount = 0;
    int checksum = 0;

    int i;

    for (i=0; i<N; i+=1)
        perm1[i] = i;
    int r = N;

    while (1) {
        while (r != 1) {
            count[r-1] = r;
            r -= 1;
        }

        for (i=0; i<N; i+=1)
            perm[i] = perm1[i];
        int flipsCount = 0;
        int k;

        while ( !((k = perm[0]) == 0) ) {
            int k2 = (k+1) >> 1;
            for (i=0; i<k2; i++) {
                int temp = perm[i]; perm[i] = perm[k-i]; perm[k-i] = temp;
            }
            flipsCount += 1;
        }

        maxFlipsCount = max(maxFlipsCount, flipsCount);
        checksum += permCount % 2 == 0 ? flipsCount : -flipsCount;

        /* Use incremental change to generate another permutation */
        while (1) {
            if (r == N) {
                printf("%d\n", checksum);
                return maxFlipsCount;
            }

            int perm0 = perm1[0];
            i = 0;
            while (i < r) {
                int j = i + 1;
                perm1[i] = perm1[j];
                i = j;
            }
            perm1[r] = perm0;
            count[r] = count[r] - 1;
            if (count[r] > 0) break;
            r++;
        }
        permCount++;
    }

    return -1;
}

int main()
{
    printf("Pfannkuchen(%d) = %d\n", N, fannkuchredux());
    return 0;
}

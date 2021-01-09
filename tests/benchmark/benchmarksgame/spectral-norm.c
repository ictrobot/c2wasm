// FROM: https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/spectralnorm-gcc-1.html
// 3-Clause BSD

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * Contributed by Sebastien Loisel
 */

#include <stdio.h>
#include <stdlib.h>
#include <math.h>

double eval_A(int i, int j) { return 1.0/((i+j)*(i+j+1)/2+i+1); }

#define N 5500

void eval_A_times_u(const double *u, double *Au)
{
  int i,j;
  for(i=0;i<N;i++)
    {
      Au[i]=0;
      for(j=0;j<N;j++) Au[i]+=eval_A(i,j)*u[j];
    }
}

void eval_At_times_u(const double *u, double *Au)
{
  int i,j;
  for(i=0;i<N;i++)
    {
      Au[i]=0;
      for(j=0;j<N;j++) Au[i]+=eval_A(j,i)*u[j];
    }
}

void eval_AtA_times_u(const double *u, double *AtAu)
{ double v[N]; eval_A_times_u(u,v); eval_At_times_u(v,AtAu); }

int main()
{
  int i;
  double u[N],v[N],vBv,vv;
  for(i=0;i<N;i++) u[i]=1;
  for(i=0;i<10;i++)
    {
      eval_AtA_times_u(u,v);
      eval_AtA_times_u(v,u);
    }
  vBv=vv=0;
  for(i=0;i<N;i++) { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
  printf("%0.9f\n",sqrt(vBv/vv));
  return 0;
}

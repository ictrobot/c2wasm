#pragma once

// c89 with wasm instructions
double sqrt(double);
double ceil(double);
double fabs(double);
double floor(double);

// c99 with wasm instructions
double fmax(double, double);
double fmin(double, double);
double trunc(double);
double copysign(double, double);
double round(double); // nearest

//double acos(double);
//double asin(double);
//double atan(double);
//double atan2(double, double);
//double cos(double);
//double sin(double);
//double tan(double);
//
//double cosh(double);
//double sinh(double);
//double tanh(double);
//
double exp(double);
//double ldexp(double, int);
//double frexp(double, int *);
//double log(double);
//double log10(double);
//double modf(double, double *);
//
//double pow(double, double);
//double fmod(double, double);

#define INFINITY (1./0)
#define NAN (0./0)

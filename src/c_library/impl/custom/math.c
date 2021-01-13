#include <math.h>
#include <wasm/f64.h>

// c89 simple wasm instructions
double sqrt(double d) {
    return f64_sqrt(d);
}

double ceil(double d) {
    return f64_ceil(d);
}

double fabs(double d) {
    return f64_abs(d);
}

double floor(double d) {
    return f64_floor(d);
}

// c99 simple wasm instructions
double fmax(double d1, double d2) {
    return f64_max(d1, d2);
}

double fmin(double d1, double d2) {
    return f64_min(d1, d2);
}

double trunc(double d) {
    return f64_trunc(d);
}

double copysign(double d1, double d2) {
    return f64_copysign(d1, d2);
}

double round(double d) {
    return f64_nearest(d);
}

// other functions
double exp(double d) {
    double sum = 1 + d, factorial = 1, power = d;
    for (int k = 2; k <= 5; k++) {
        power *= d;
        factorial *= k;
        sum += power / factorial;
    }
    return sum;
}

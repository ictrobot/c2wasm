#ifndef RAYTRACERC_RGB_H
#define RAYTRACERC_RGB_H

typedef struct {
  double r;
  double g;
  double b;
} RGB;

RGB rgb_val(double d);

RGB rgb_ints(int r, int g, int b);

RGB rgb_add(RGB x, RGB y);

RGB rgb_scale(RGB x, RGB other);

RGB rgb_scaleConst(RGB x, double s);

#endif //RAYTRACERC_RGB_H

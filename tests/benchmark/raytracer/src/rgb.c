#include "rgb.h"

RGB rgb_val(double d) {
  RGB rgb;
  rgb.r = d;
  rgb.g = d;
  rgb.b = d;
  return rgb;
}

RGB rgb_ints(int r, int g, int b) {
  RGB rgb;
  rgb.r = (double) r / 255.0;
  rgb.g = (double) g / 255.0;
  rgb.b = (double) b / 255.0;
  return rgb;
}

RGB rgb_add(RGB x, RGB y) {
  RGB rgb;
  rgb.r = x.r + y.r;
  rgb.g = x.g + y.g;
  rgb.b = x.b + y.b;
  return rgb;
}

RGB rgb_scaleConst(RGB x, double s) {
  RGB rgb;
  rgb.r = x.r * s;
  rgb.g = x.g * s;
  rgb.b = x.b * s;
  return rgb;
}

RGB rgb_scale(RGB x, RGB other) {
  RGB rgb;
  rgb.r = x.r * other.r;
  rgb.g = x.g * other.g;
  rgb.b = x.b * other.b;
  return rgb;
}

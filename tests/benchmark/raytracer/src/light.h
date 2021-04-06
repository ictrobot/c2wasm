#ifndef RAYTRACERC_LIGHT_H
#define RAYTRACERC_LIGHT_H

#include "vector3.h"
#include "rgb.h"

typedef struct {
  Vec3 pos;
  RGB colour;
  double intensity;
} Light;

Light *light_new(Vec3 pos, RGB colour, double intensity);

RGB light_getIlluminationAt(Light *light, double distance);

#endif //RAYTRACERC_LIGHT_H

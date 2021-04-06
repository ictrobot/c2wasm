#include <stdlib.h>
#include "light.h"

Light *light_new(Vec3 pos, RGB colour, double intensity) {
  Light *light = malloc(sizeof(Light));
  light->pos = pos;
  light->colour = colour;
  light->intensity = intensity;
  return light;
}

RGB light_getIlluminationAt(Light *light, double distance) {
  double scale = light->intensity / (PI * 4 * distance * distance);
  return rgb_scaleConst(light->colour, scale);
}

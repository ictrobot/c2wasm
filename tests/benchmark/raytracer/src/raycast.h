#ifndef RAYTRACERC_RAYCAST_H
#define RAYTRACERC_RAYCAST_H

#include "vector3.h"
#include <stddef.h>

typedef struct {
  Vec3 origin;
  Vec3 direction;
} Ray;

Vec3 ray_eval(Ray ray, double distance);

typedef struct {
  double dist;
  struct object *object;
  Vec3 location;
  Vec3 normal;
} RaycastHit;

extern RaycastHit raycast_miss;

#endif //RAYTRACERC_RAYCAST_H

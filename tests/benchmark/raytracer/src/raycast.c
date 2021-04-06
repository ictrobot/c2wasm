#include <math.h>
#include "raycast.h"

Vec3 ray_eval(Ray ray, double distance) {
  return vec3_add(ray.origin, vec3_scaleConst(ray.direction, distance));
}

RaycastHit raycast_miss = {1e100};

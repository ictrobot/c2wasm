#include <stdlib.h>
#include "objects.h"

static const double KD = 0.6;
static const double KS = 0.0;
static const double ALPHA = 0.0;
static const double REFLECTIVITY = 0.1;

typedef struct {
  Object object;
  Vec3 pos;
  Vec3 normal;
} Plane;

static Vec3 getNormalAt(Object *object, Vec3 pos) {
  Plane *plane = (Plane *) object;
  return plane->normal;
}

static RaycastHit intersectWith(Object *object, Ray ray) {
  Plane *plane = (Plane *) object;

  double DdotN = vec3_dot(ray.direction, plane->normal);
  if (DdotN == 0) return raycast_miss;

  RaycastHit hit;
  hit.dist = vec3_dot(vec3_sub(plane->pos, ray.origin), plane->normal) / DdotN;
  if (hit.dist < 0) return raycast_miss;
  hit.location = ray_eval(ray, hit.dist);
  hit.object = object;
  hit.normal = getNormalAt(object, hit.location);
  return hit;
}

Object *obj_makePlane(Vec3 pos, RGB colour, Vec3 normal) {
  Plane *plane = malloc(sizeof(Plane));
  plane->object.phong_kD = KD;
  plane->object.phong_kS = KS;
  plane->object.phong_alpha = ALPHA;
  plane->object.reflectivity = REFLECTIVITY;
  plane->object.colour = colour;
  plane->object._intersectWith = &intersectWith;
  plane->object._getNormalAt = &getNormalAt;
  plane->pos = pos;
  plane->normal = vec3_norm(normal);
  return &plane->object;
}

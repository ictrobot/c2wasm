#ifndef RAYTRACERC_OBJECTS_H
#define RAYTRACERC_OBJECTS_H

#include "rgb.h"
#include "vector3.h"
#include "raycast.h"

typedef struct object Object;

struct object {
  RGB colour;
  double phong_kD, phong_kS, phong_alpha;
  double reflectivity;

  Vec3 (*_getNormalAt)(Object *, Vec3);

  RaycastHit (*_intersectWith)(Object *, Ray);
};

Vec3 obj_getNormalAt(Object *obj, Vec3 vec3);

RaycastHit obj_intersectWith(Object *obj, Ray ray);

Object *obj_makeSphere(Vec3 pos, RGB colour, double radius);

Object *obj_makePlane(Vec3 pos, RGB colour, Vec3 normal);

#endif //RAYTRACERC_OBJECTS_H

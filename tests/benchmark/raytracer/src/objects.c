#include "objects.h"

Vec3 obj_getNormalAt(Object *obj, Vec3 vec3) {
  return obj->_getNormalAt(obj, vec3);
}

RaycastHit obj_intersectWith(Object *obj, Ray ray) {
  return obj->_intersectWith(obj, ray);
}

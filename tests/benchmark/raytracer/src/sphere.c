#include <math.h>
#include <stdlib.h>
#include "objects.h"

static const double KD = 0.8;
static const double KS = 1.2;
static const double ALPHA = 10;
static const double REFLECTIVITY = 0.3;

typedef struct {
  Object object;
  Vec3 pos;
  double radius;
} Sphere;

static Vec3 getNormalAt(Object *object, Vec3 pos) {
  Sphere *sphere = (Sphere *) object;
  return vec3_norm(vec3_sub(pos, sphere->pos));
}

static RaycastHit intersectWith(Object *object, Ray ray) {
  Sphere *sphere = (Sphere *) object;

  Vec3 OsubC = vec3_sub(ray.origin, sphere->pos);

  double a = vec3_magnitude(ray.direction);
  double b = 2 * vec3_dot(ray.direction, OsubC);
  double c = vec3_magnitude2(OsubC) - (sphere->radius * sphere->radius);

  double discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return raycast_miss;

  double discriminant_sqrt = sqrt(discriminant);
  double solution1 = (-b + discriminant_sqrt) / (2 * a);
  double solution2 = (-b - discriminant_sqrt) / (2 * a);

  RaycastHit hit;
  if (solution1 < 0) {
    if (solution2 < 0) {
      return raycast_miss;
    } else {
      hit.dist = solution2;
    }
  } else {
    if (solution2 < 0) {
      hit.dist = solution1;
    } else {
      hit.dist = solution1 < solution2 ? solution1 : solution2;
    }
  }
  hit.location = ray_eval(ray, hit.dist);
  hit.object = object;
  hit.normal = getNormalAt(object, hit.location);
  return hit;
}

Object *obj_makeSphere(Vec3 pos, RGB colour, double radius) {
  Sphere *sphere = malloc(sizeof(Sphere));
  sphere->object.phong_kD = KD;
  sphere->object.phong_kS = KS;
  sphere->object.phong_alpha = ALPHA;
  sphere->object.reflectivity = REFLECTIVITY;
  sphere->object.colour = colour;
  sphere->object._intersectWith = &intersectWith;
  sphere->object._getNormalAt = &getNormalAt;
  sphere->pos = pos;
  sphere->radius = radius;
  return &sphere->object;
}

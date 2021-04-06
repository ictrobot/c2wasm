#include "vector3.h"
#include "math.h"

Vec3 vec3_val(double d) {
  Vec3 result;
  result.x = d;
  result.y = d;
  result.z = d;
  return result;
}

Vec3 vec3_coords(double x, double y, double z) {
  Vec3 result;
  result.x = x;
  result.y = y;
  result.z = z;
  return result;
}

Vec3 vec3_add(Vec3 v, Vec3 other) {
  Vec3 result;
  result.x = v.x + other.x;
  result.y = v.y + other.y;
  result.z = v.z + other.z;
  return result;
}

Vec3 vec3_sub(Vec3 v, Vec3 other) {
  Vec3 result;
  result.x = v.x - other.x;
  result.y = v.y - other.y;
  result.z = v.z - other.z;
  return result;
}

Vec3 vec3_scaleConst(Vec3 v, double d) {
  Vec3 result;
  result.x = v.x * d;
  result.y = v.y * d;
  result.z = v.z * d;
  return result;
}

double vec3_dot(Vec3 v, Vec3 other) {
  return (v.x * other.x) + (v.y * other.y) + (v.z * other.z);
}

double vec3_magnitude2(Vec3 v) {
  return (v.x * v.x) + (v.y * v.y) + (v.z * v.z);
}

double vec3_magnitude(Vec3 v) {
  return sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z));
}

Vec3 vec3_norm(Vec3 v) {
  return vec3_scaleConst(v, 1 / vec3_magnitude(v));
}

Vec3 vec3_reflect(Vec3 v, Vec3 normal) {
  return vec3_sub(vec3_scaleConst(normal, 2 * vec3_dot(v, normal)), v);
}

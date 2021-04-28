#include <math.h>
#include <stdlib.h>
#include "renderer.h"
#include "camera.h"
#include "random.h"

static const double EPSILON = 0.001;

static RaycastHit findClosestHit(Scene *scene, Ray ray) {
  RaycastHit closest = raycast_miss;
  for (int i = 0; i < scene->lenObj; i++) {
    RaycastHit trial = obj_intersectWith(scene->objects[i], ray);
    if (trial.dist < closest.dist) closest = trial;
  }
  return closest;
}

#ifdef __c2wasm__
static double pow(double a, double b) {
    double r = 1; // assumes b is integer
    for (int i = 0; i < b; i++) r *= a;
    return r;
}
#endif

static RGB illuminate(Scene *scene, Ray ray, RaycastHit hit) {
  RGB result = rgb_scale(hit.object->colour, scene->ambientLight);

  for (int i = 0; i < scene->lenLight; i++) {
    Light *light = scene->lights[i];

    double distanceToLight = vec3_magnitude(vec3_sub(light->pos, hit.location));
    RGB I = light_getIlluminationAt(light, distanceToLight);

    Vec3 V = vec3_norm(vec3_sub(ray.origin, hit.location));
    Vec3 L = vec3_norm(vec3_sub(light->pos, hit.location));
    Vec3 R = vec3_norm(vec3_reflect(L, hit.normal));

    double NdotL = vec3_dot(hit.normal, L);
    double RdotV = vec3_dot(R, V);
    if (NdotL <= 0 && RdotV <= 0) continue;

    Ray shadowRay;
    shadowRay.direction = vec3_norm(vec3_sub(light->pos, hit.location));
    shadowRay.origin = vec3_add(hit.location, vec3_scaleConst(shadowRay.direction, EPSILON));
    RaycastHit shadowHit = findClosestHit(scene, shadowRay);
    if (shadowHit.dist > distanceToLight) {
      if (NdotL > 0) {
        RGB diffuse = rgb_scaleConst(rgb_scale(rgb_scaleConst(hit.object->colour, hit.object->phong_kD), I), NdotL);
        result = rgb_add(result, diffuse);
      }

      if (RdotV > 0 && hit.object->phong_kS > 0) {
        RGB specular = rgb_scaleConst(rgb_scale(rgb_scaleConst(light->colour, hit.object->phong_kS), I), pow(RdotV, hit.object->phong_alpha));
        result = rgb_add(result, specular);
      }
    }
  }
  return result;
}

static RGB trace(Scene *scene, Ray ray, int bouncesLeft) {
  RaycastHit hit = findClosestHit(scene, ray);
  if (hit.object == NULL) return scene->backgroundColor;

  RGB directIllumination = illuminate(scene, ray, hit);
  if (bouncesLeft <= 0 || hit.object->reflectivity <= 0) {
    return directIllumination;
  } else {
    directIllumination = rgb_scaleConst(directIllumination, 1 - hit.object->reflectivity);

    Ray reflectedRay;
    reflectedRay.direction = vec3_norm(vec3_reflect(vec3_scaleConst(ray.direction, -1), hit.normal));
    reflectedRay.origin = vec3_add(hit.location, vec3_scaleConst(reflectedRay.direction, EPSILON));

    RGB reflectedIllumination = trace(scene, reflectedRay, bouncesLeft - 1);
    reflectedIllumination = rgb_scaleConst(reflectedIllumination, hit.object->reflectivity);

    return rgb_add(directIllumination, reflectedIllumination);
  }
}

static RGB traceRay(Scene *scene, Ray ray) {
  if (scene->dofAmount == 0) {
    return trace(scene, ray, scene->bounces);
  } else {
    Vec3 focalPoint = ray_eval(ray, scene->dofDistance);
    RGB value = rgb_val(0);
    for (int c = 0; c < scene->dofRays; c++) {
      Vec3 origin = ray.origin;
      origin.x += (1 - (2 * random_one())) * scene->dofAmount;
      origin.y += (1 - (2 * random_one())) * scene->dofAmount;

      Ray dofRay;
      dofRay.origin = origin;
      dofRay.direction = vec3_norm(vec3_sub(focalPoint, origin));

      value = rgb_add(value, trace(scene, dofRay, scene->bounces));
    }
    return rgb_scaleConst(value, 1.0 / scene->dofRays);
  }
}

static void renderThread(Camera *camera, Scene* scene, Image image) {
  for (int x = 0; x < image.width; x++) {
    for (int y = 0; y < image.height; y++) {
      RGB value;

      if (scene->samples <= 1) {
        Ray ray = camera_cast(camera, x, y);
        value = traceRay(scene, ray);
      } else {
        value = rgb_val(0);

        int jitteredSize = (int) sqrt(scene->samples);
        for (int iX = 0; iX < jitteredSize; iX++) {
          double offsetX = (iX + random_one()) / jitteredSize;
          for (int iY = 0; iY < jitteredSize; iY++) {
            double offsetY = (iY + random_one()) / jitteredSize;
            Ray ray = camera_cast(camera, x - 0.5 + offsetX, y - 0.5 + offsetY);
            value = rgb_add(value, traceRay(scene, ray));
          }
        }

        int remainingSamples = scene->samples - (jitteredSize * jitteredSize);
        for (int i = 0; i < remainingSamples; i++) {
          Ray ray = camera_cast(camera, x - 0.5 + random_one(), y - 0.5 + random_one());
          value = rgb_add(value, traceRay(scene, ray));
        }

        value = rgb_scaleConst(value, 1.0 / scene->samples);
      }
      img_setPx(image, x, y, value);
    }
  }
}

Image render(int width, int height, Scene *scene) {
  Camera *camera = camera_new(width, height);
  Image image = img_new(width, height);
  renderThread(camera, scene, image);
  free(camera);
  return image;
}

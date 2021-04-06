#include <stdlib.h>
#include <math.h>
#include "camera.h"

Camera *camera_new(int width, int height) {
  Camera *camera = malloc(sizeof(Camera));

  camera->width_px = width;
  camera->height_px = height;

  camera->aspectRatio = ((double) width) / ((double) height);

  camera->width_m = 2 * sqrt(3) / 3; // 2 * tan(rad(fov) / 2), fov = 60 degrees
  camera->height_m = camera->width_m / camera->aspectRatio;

  camera->x_step_m = camera->width_m / width;
  camera->y_step_m = camera->height_m / height;

  return camera;
}

Ray camera_cast(Camera *camera, double x, double y) {
  double x_pos = (camera->x_step_m - camera->width_m) / 2 + x * camera->x_step_m;
  double y_pos = (camera->y_step_m + camera->height_m) / 2 - y * camera->y_step_m;

  Ray ray;
  ray.origin = vec3_val(0);
  ray.direction = vec3_norm(vec3_coords(x_pos, y_pos, 1));
  return ray;
}

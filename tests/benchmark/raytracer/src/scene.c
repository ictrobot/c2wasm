#include <stdlib.h>
#include "scene.h"

Scene *scene_make(void) {
  Scene *scene = malloc(sizeof(Scene));
  scene->ambientLight = rgb_val(1.0 / 3.0);
  scene->backgroundColor = rgb_val(0.001);

  scene->lights = malloc(sizeof(Light *) * 2);
  scene->lenLight = 2;

  scene->lights[0] = light_new(vec3_coords(2, 2, 4.5), rgb_ints(255, 176, 178), 100);
  scene->lights[1] = light_new(vec3_coords(-2, 2.5, 1), rgb_ints(255, 245, 204), 200);

  scene->objects = malloc(sizeof(Object *) * 4);
  scene->lenObj = 4;

  // conflict with returning structures!
  scene->objects[0] = obj_makeSphere(vec3_coords(-0.95, -0.21884, 3.63261), rgb_ints(255, 29, 37), 0.35);
  scene->objects[1] = obj_makeSphere(vec3_coords(-0.4, 0.5, 4.33013), rgb_ints(0, 113, 188), 0.7);
  scene->objects[2] = obj_makeSphere(vec3_coords(0.72734, -0.35322, 3.19986), rgb_ints(58, 160, 16), 0.45);
  scene->objects[3] = obj_makePlane(vec3_coords(0.0, -0.10622, 4.68013), rgb_ints(34, 34, 34),
                                    vec3_coords(0, 4.2239089012146, -2.180126190185547));

  scene->dofDistance = 4.2;
  scene->dofAmount = 0.05;

  // quality settings
  scene->bounces = 3;
  scene->dofRays = 2;
  scene->samples = 3;

  return scene;
}

void scene_free(Scene *scene) {
  for (int i = 0; i < scene->lenLight; i++) {
    free(scene->lights[i]);
  }
  free(scene->lights);

  for (int i = 0; i < scene->lenObj; i++) {
    free(scene->objects[i]);
  }
  free(scene->objects);

  free(scene);
}

#include <time.h>
#include "scene.h"
#include "renderer.h"
#include "stdio.h"

#define WIDTH 960
#define HEIGHT 540

int main() {
  Scene *scene = scene_make();
  printf("Initialised scene with %i objects and %i lights\n", scene->lenObj, scene->lenLight);

  printf("Starting %ix%i render\n", WIDTH, HEIGHT);
  clock_t t = clock();
  Image image = render(WIDTH, HEIGHT, scene);
  t = clock() - t;
  double time_taken = ((double) t) / CLOCKS_PER_SEC;
  printf("Rendered scene in %.3f seconds\n", time_taken);

  t = clock();
  int returnCode = img_save(image, "render.ppm");

  if (returnCode == 0) {
    t = clock() - t;
    time_taken = ((double) t) / CLOCKS_PER_SEC;
    printf("Saved PPM in %.3f seconds\n", time_taken);
  } else {
    fprintf(stderr, "Failed to save");
  }

  scene_free(scene);
  return returnCode;
}

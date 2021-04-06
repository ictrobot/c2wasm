#ifndef RAYTRACERC_IMAGE_H
#define RAYTRACERC_IMAGE_H

#include "rgb.h"

typedef struct {
  int width, height, length;
  RGB *data;
} Image;

Image img_new(int width, int height);

void img_setPx(Image image, int x, int y, RGB colour);

int img_save(Image image, char *filename);

#endif //RAYTRACERC_IMAGE_H

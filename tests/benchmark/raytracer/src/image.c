#include <stdlib.h>
#include <stdint.h>
#include <stdio.h>
#include "image.h"

Image img_new(int width, int height) {
  Image img;
  img.width = width;
  img.height = height;
  img.length = width * height;
  img.data = malloc(sizeof(RGB) * width * height);
  return img;
}

void img_setPx(Image image, int x, int y, RGB colour) {
  image.data[x + (y * image.width)] = colour;
}

static inline uint8_t component(double d) {
  if (d <= 0)
    return 0;
  if (d >= 1)
    return 255;
  return (uint8_t) (d * 255.0);
}

int img_save(Image image, char *filename) {
  static uint8_t colour[3];

  FILE *fp = fopen(filename, "wb");
  fprintf(fp, "P6\n%d %d\n255\n", image.width, image.height);
  for (int y = 0, i = 0; y < image.height; ++y) {
    for (int x = 0; x < image.width; ++x, ++i) {
      RGB rgb = image.data[i];
      colour[0] = component(rgb.r);
      colour[1] = component(rgb.g);
      colour[2] = component(rgb.b);
      fwrite(colour, 1, 3, fp);
    }
  }
  fclose(fp);
  return 0;
}

#define PAGE_SIZE 65536
static int __malloc_ptr = 1048576;

static void* malloc(unsigned int bytes) {
  bytes += 4 - (bytes % 4);
  void* thisPointer = (void*) __malloc_ptr;
  __malloc_ptr += bytes;

  // grow memory if needed
  int currentPages = __wasm_i32__(0x3F, 0x00); // memory.size

  if (__malloc_ptr > currentPages * PAGE_SIZE) {
    __wasm_push__(1, 1 + (__malloc_ptr / PAGE_SIZE) - currentPages);
    __wasm__(0x40, 0, 0x1A); // memory.grow, drop
  }

  return thisPointer;
}

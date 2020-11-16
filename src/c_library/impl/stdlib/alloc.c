#define PAGE_SIZE 65536
#define size_t unsigned int

struct __alloc_node {
    struct __alloc_node *prev;
    struct __alloc_node *next;
    size_t size;
    char blockStart;
};
#define __alloc_offset 12

static struct __alloc_node __alloc_list;

// inspired by https://github.com/embeddedartistry/embedded-resources/blob/master/examples/c/malloc_freelist.c

static void merge_blocks(struct __alloc_node* node) {
    struct __alloc_node* last = 0;

    while(node && node->next) {
        size_t end = (size_t) node + __alloc_offset + node->size;
        struct __alloc_node* next = node->next;

        if (end == (size_t) next) {
            // merge next into node
            node->size += __alloc_offset + next->size;
            node->next = next->next;
            if (node->next->prev) node->next->prev = node;

            // clear old allocation header to zero
            next->prev = 0;
            next->next = 0;
            next->size = 0;
        } else {
            node = next;
        }
    }
}

void* malloc(size_t size) {
    if(size > 0) {
        size = (size + 31) & ~31; // 32 byte align

        struct __alloc_node *block = &__alloc_list, *last = block;
        while (block) {
            if (block->size >= size) {
                // found large enough block

                if (block->size - size > 48) {
                    // split the block
                    struct __alloc_node *new_block = (struct __alloc_node*) (&block->blockStart + size);
                    new_block->size = block->size - size - __alloc_offset;
                    new_block->prev = block;
                    new_block->next = block->next;

                    block->size = size;
                    if (block->next) block->next->prev = new_block;
                    block->next = new_block;
                }
                // remove block from list
                struct __alloc_node *prev = block->prev, *next = block->next;

                if (prev) prev->next = next;
                if (next) next->prev = prev;

                // place holder values which can be checked
                block->next = (struct __alloc_node *) -1;
                block->prev = (struct __alloc_node *) 7;

                return &block->blockStart;
            }

            last = block;
            block = block->next;
        }

        // failed to find block, try allocating more webassembly memory
        int pages = 1 + ((size + __alloc_offset) / PAGE_SIZE);
        __wasm_push__(1, pages);
        int result = __wasm_i32__(0x40, 0); // wasm: memory.grow
        if (result < 0) {
            // failed to allocate...
            return 0;
        } else {
            last->next = (struct __alloc_node*) (result * PAGE_SIZE);
            last->next->size = (pages * PAGE_SIZE) - __alloc_offset;
            last->next->prev = last;

            merge_blocks(last);
            return malloc(size);
        }
    }

    return 0;
}

void free(void* ptr) {
    if (ptr) {
        struct __alloc_node* block = (struct __alloc_node*) ((char*)ptr - 12);

        if ((int) block->next != -1 || (int) block->prev != 7) {
            // not an allocated block!
            return;
        }

        // wipe block (technically not needed)
        __wasm_push__(3, ptr, 0, block->size); // destAddr value size
        __wasm__(0xFC, 0x0B, 0x00); // memory.fill

        // find where to slot in block
        struct __alloc_node* list = &__alloc_list;
        while (list->next && list->next < block) {
            list = list->next;
        }

        // slot block into list
        block->prev = list;
        block->next = list->next;

        if (list->next && list->next->prev) list->next->prev = block;
        list->next = block;

        // cleanup
        merge_blocks(&__alloc_list);
    }
}

void* realloc(void* ptr, size_t size) {
    if (ptr) {
        struct __alloc_node* block = (struct __alloc_node*) ((char*)ptr - 12);

        if ((int) block->next != -1 || (int) block->prev != 7) {
            // not an allocated block!
            return 0;
        }

        if (block->size > size) {
            // block already large enough
            return ptr;
        }

        void* new_ptr = malloc(size);
        __wasm_push__(3, new_ptr, ptr, block->size); // destAddr sourceAddr size
        __wasm__(0xFC, 0x0A, 0x00, 0x00); // memory.copy
        free(ptr);
        return new_ptr;
    }
    return 0;
}

void* calloc(size_t nobj, size_t size) {
    if (nobj && size) {
        size *= nobj;
        void* ptr = malloc(size);

        if (ptr) {
            // should already be zeroed... but do it again just in case
            __wasm_push__(3, ptr, 0, size); // destAddr value size
            __wasm__(0xFC, 0x0B, 0x00); // memory.fill
        }
        return ptr;
    }
    return 0;
}

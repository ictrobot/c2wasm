#include <stdlib.h>

#define PAGE_SIZE 65536
#define ALLOC_OFFSET 12

static struct node {
    struct node *prev;
    struct node *next;
    size_t size;
    char blockStart;
} alloc_list;

// inspired by https://github.com/embeddedartistry/embedded-resources/blob/master/examples/c/malloc_freelist.c

static void merge_blocks(struct node* node) {
    struct node* last = NULL;

    while(node && node->next) {
        size_t end = (size_t) node + ALLOC_OFFSET + node->size;
        struct node* next = node->next;

        if (end == (size_t) next) {
            // merge next into node
            node->size += ALLOC_OFFSET + next->size;
            node->next = next->next;
            if (node->next->prev) node->next->prev = node;

            // clear old allocation header to zero
            next->prev = NULL;
            next->next = NULL;
            next->size = 0;
        } else {
            node = next;
        }
    }
}

void* malloc(size_t size) {
    if(size > 0) {
        size = (size + 31) & ~31; // 32 byte align

        struct node *block = &alloc_list, *last = block;
        while (block) {
            if (block->size >= size) {
                // found large enough block

                if (block->size - size > 48) {
                    // split the block
                    struct node *new_block = (struct node*) (&block->blockStart + size);
                    new_block->size = block->size - size - ALLOC_OFFSET;
                    new_block->prev = block;
                    new_block->next = block->next;

                    block->size = size;
                    if (block->next) block->next->prev = new_block;
                    block->next = new_block;
                }
                // remove block from list
                struct node *prev = block->prev, *next = block->next;

                if (prev) prev->next = next;
                if (next) next->prev = prev;

                // place holder values which can be checked
                block->next = (struct node *) -1;
                block->prev = (struct node *) 7;

                return &block->blockStart;
            }

            last = block;
            block = block->next;
        }

        // failed to find block, try allocating more webassembly memory
        int pages = 1 + ((size + ALLOC_OFFSET) / PAGE_SIZE);
        __wasm_push__(1, pages);
        int result = __wasm_i32__(0x40, 0); // wasm: memory.grow
        if (result < 0) {
            // failed to allocate...
            return NULL;
        } else {
            last->next = (struct node*) (result * PAGE_SIZE);
            last->next->size = (pages * PAGE_SIZE) - ALLOC_OFFSET;
            last->next->prev = last;

            merge_blocks(last);
            return malloc(size);
        }
    }

    return NULL;
}

void free(void* ptr) {
    if (ptr) {
        struct node* block = (struct node*) ((char*)ptr - 12);

        if ((int) block->next != -1 || (int) block->prev != 7) {
            // not an allocated block!
            return;
        }

        // wipe block (technically not needed)
        __wasm_push__(3, ptr, 0, block->size); // destAddr value size
        __wasm__(0xFC, 0x0B, 0x00); // memory.fill

        // find where to slot in block
        struct node* list = &alloc_list;
        while (list->next && list->next < block) {
            list = list->next;
        }

        // slot block into list
        block->prev = list;
        block->next = list->next;

        if (list->next && list->next->prev) list->next->prev = block;
        list->next = block;

        // cleanup
        merge_blocks(&alloc_list);
    }
}

void* realloc(void* ptr, size_t size) {
    if (ptr) {
        struct node* block = (struct node*) ((char*)ptr - 12);

        if ((int) block->next != -1 || (int) block->prev != 7) {
            // not an allocated block!
            return NULL;
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
    return NULL;
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
    return NULL;
}

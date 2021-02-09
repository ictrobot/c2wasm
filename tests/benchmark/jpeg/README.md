jpeg-6b downloaded from https://ijg.org/files/jpegsr6b.zip

jpegsr6b.zip SHA256: BF8ED96B55DE0A7176F2E6F04ECAF55F6F3556F75EFBC511FE8E0557CE2CB00B

Subset of original files included, in particular most make files are not included.

The included files are unmodified, apart from:
1) c2wasm's preprocessor is very basic and so lines containing macros split across multiple lines needed line continuing
   slashes inserted.

2) All other changes are marked with a comment containing "CHANGED" in all capitals. These small changes either slightly
   rearrange code to enable it to work with c2wasm's limited goto support or add returns at the end of functions which
   it doesn't think will always return.

3) `cjpeg.c` is modified in a few places to add timing support.

The original README containing the license is included in the src folder.

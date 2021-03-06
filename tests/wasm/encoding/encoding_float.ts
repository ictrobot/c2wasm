import test from "ava";
import {encodeF32, encodeF64} from "../../../src/wasm/encoding";

test('f32 encoding', t => {
    for (const [value, result] of _f32_testcases) {
        t.deepEqual(encodeF32(value), result);
    }
});

test('f64 encoding', t => {
    for (const [value, result] of _f64_testcases) {
        t.deepEqual(encodeF64(value), result);
    }
});

const _f32_testcases: [number, number[]][] = [
    [120797.625, [208, 238, 235, 71]],
    [-577350.5625, [105, 244, 12, 201]],
    [-602297.9375, [159, 11, 19, 201]],
    [918225.1875, [19, 45, 96, 73]],
    [103229.5390625, [197, 158, 201, 71]],
    [-118841.4375, [184, 28, 232, 199]],
    [-334716.375, [140, 111, 163, 200]],
    [885788.0625, [193, 65, 88, 73]],
    [-963787.6875, [187, 76, 107, 201]],
    [-522525.625, [180, 35, 255, 200]],
    [-230751.234375, [207, 87, 97, 200]],
    [-310970.625, [84, 215, 151, 200]],
    [440285.46875, [175, 251, 214, 72]],
    [881500.9375, [207, 53, 87, 73]],
    [130019.4609375, [187, 241, 253, 71]],
    [-801375.25, [244, 165, 67, 201]],
    [-815338.1875, [163, 14, 71, 201]],
    [247088.65625, [42, 76, 113, 72]],
    [-860752.5, [8, 37, 82, 201]],
    [-566166.8125, [109, 57, 10, 201]],
    [Infinity, [0, 0, 128, 127]],
    [-Infinity, [0, 0, 128, 255]],
    [NaN, [0, 0, 192, 127]]
];

const _f64_testcases: [number, number[]][] = [
    [-552967.4198210614, [66, 201, 242, 214, 14, 224, 32, 193]],
    [-118419.85407778679, [40, 120, 77, 170, 61, 233, 252, 192]],
    [-769058.2360641258, [168, 101, 221, 120, 68, 120, 39, 193]],
    [365889.1575530693, [128, 151, 85, 161, 4, 85, 22, 65]],
    [-97073.35480261908, [216, 130, 69, 173, 21, 179, 247, 192]],
    [917930.7331162761, [60, 4, 91, 119, 85, 3, 44, 65]],
    [-22244.912294639507, [64, 14, 9, 99, 58, 185, 213, 192]],
    [747825.8539212919, [236, 43, 53, 181, 99, 210, 38, 65]],
    [-95797.97169468552, [0, 186, 15, 140, 95, 99, 247, 192]],
    [890834.7558506788, [52, 220, 254, 130, 165, 47, 43, 65]],
    [88276.37546065636, [128, 8, 227, 1, 70, 141, 245, 64]],
    [-844426.0100147185, [49, 166, 32, 5, 20, 197, 41, 193]],
    [47431.710177856265, [96, 233, 198, 185, 246, 40, 231, 64]],
    [-243411.19765099208, [24, 11, 202, 148, 153, 182, 13, 193]],
    [985904.2209023645, [94, 29, 26, 113, 96, 22, 46, 65]],
    [-125590.17139655678, [224, 80, 10, 190, 98, 169, 254, 192]],
    [607738.1110275625, [204, 154, 216, 56, 244, 139, 34, 65]],
    [-122498.35015984974, [240, 54, 65, 154, 37, 232, 253, 192]],
    [-22835.06306421873, [64, 129, 62, 9, 196, 76, 214, 192]],
    [459967.5629845648, [152, 6, 127, 64, 254, 18, 28, 65]],
    [Infinity, [0, 0, 0, 0, 0, 0, 240, 127]],
    [-Infinity, [0, 0, 0, 0, 0, 0, 240, 255]],
    [NaN, [0, 0, 0, 0, 0, 0, 248, 127]]
];

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const demoPath = "./demos/";
const demoFiles = Object.fromEntries(require("fs")
        .readdirSync(demoPath)
        .filter(filename => filename.endsWith(".ts"))
        .map(fileName => [fileName.split(".")[0], demoPath + fileName]));


module.exports = (env, argv) => {
    const minimizer = [
            new TerserPlugin({
            terserOptions: {
                output: {comments: false},
                keep_classnames: true
            },
            extractComments: false
        })
    ];

    const demos = {
        entry: demoFiles,
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname, 'dist/demos/'),
        },
        resolve: {
            extensions: [".ts", ".js"],
            fallback: Object.fromEntries(["crypto", "path", "fs", "stream", "util"].map(x => [x, false]))
        },
        module: {
            rules: [{test: /\.ts$/, loader: "ts-loader"}]
        },
        plugins: Object.keys(demoFiles).map(entryPoint => new HtmlWebpackPlugin({
            title: `c2wasm ${entryPoint}`,
            chunks: [entryPoint],
            filename: `${entryPoint}.html`,
            template: "demos/index.html"
        })),
        target: "es2020",
        optimization: {
            minimize: argv.mode !== "development",
            minimizer
        },
        devtool: argv.mode !== "development" ? "source-map" : "eval-source-map",
        mode: argv.mode ?? "production"
    };
    if (argv.mode === "development") return [demos];

    function lib(mode) {
        return {
            entry: "./src/index.ts",
            output: {
                filename: `${mode}.js`,
                path: path.resolve(__dirname, 'dist/'),
                library: "c2wasm",
                libraryTarget: "umd"
            },
            resolve: {
                extensions: [".ts", ".js"],
                fallback: {fs: false}
            },
            module: {
                rules: [{test: /\.ts$/, loader: "ts-loader"}]
            },
            target: "es2020",
            optimization: {
                minimizer
            },
            externals: mode !== "bundle" ? ["moo"] : [],
            devtool: "source-map",
            mode: argv.mode ?? "production"
        };
    }

    return [demos, lib("c2wasm"), lib("bundle")];
}

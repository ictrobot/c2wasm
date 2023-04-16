const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");

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

    const tsLoaderOptions = {
        onlyCompileBundledFiles: true,
        compilerOptions: {
            module: "es2020",
            moduleResolution: "node",
        },
    };

    const demos = {
        entry: demoFiles,
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname, 'dist/demos/'),
            chunkFormat: 'module',
        },
        resolve: {
            extensions: [".ts", ".js"],
            fallback: Object.fromEntries(["crypto", "path", "fs", "stream", "util", "buffer"].map(x => [x, false]))
        },
        module: {
            rules: [{test: /\.ts$/, loader: "ts-loader", options: tsLoaderOptions}]
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {context: "build/examples/", from: "*.json", to: "examples"}
                ]
            }),
            ...Object.keys(demoFiles).map(entryPoint => new HtmlWebpackPlugin({
                title: entryPoint === 'index' ? 'c2wasm' : `c2wasm ${entryPoint}`,
                chunks: [entryPoint],
                filename: `${entryPoint}.html`,
                template: "demos/index.html",
                scriptLoading: "blocking"
            }))
        ],
        target: "es2020",
        optimization: {
            minimize: argv.mode !== "development",
            minimizer
        },
        devtool: argv.mode !== "development" ? "source-map" : "eval-source-map",
        mode: argv.mode ?? "production"
    };
    if (argv.mode === "development") return [demos];

    return [demos, {
        entry: "./src/index.ts",
        output: {
            filename: `c2wasm.js`,
            path: path.resolve(__dirname, 'dist/'),
            library: "c2wasm",
            libraryTarget: "umd",
            chunkFormat: 'module',
        },
        resolve: {
            extensions: [".ts", ".js"],
            fallback: {fs: false}
        },
        module: {
            rules: [{test: /\.ts$/, loader: "ts-loader", options: tsLoaderOptions}]
        },
        target: "es2020",
        optimization: {
            minimizer
        },
        devtool: "source-map",
        mode: "production"
    }];
}

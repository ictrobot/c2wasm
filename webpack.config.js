const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const demoPath = "./demos/";
const demoFiles = Object.fromEntries(require("fs")
        .readdirSync(demoPath)
        .filter(filename => filename.endsWith(".ts"))
        .map(fileName => [fileName.split(".")[0], demoPath + fileName]));


module.exports = (env, argv) => ({
    entry: demoFiles,
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, 'dist/demos/'),
    },
    resolve: {
        extensions: [".ts", ".js"],
        fallback: Object.fromEntries(["crypto", "path", "fs", "stream"].map(x => [x, false]))
    },
    module: {
        rules: [{ test: /\.ts$/, loader: "ts-loader" }]
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
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    output: {comments: false},
                    keep_classnames: true
                },
                extractComments: false
            })
        ]
    },
    devtool: argv.mode !== "development" ? "source-map" : "eval-source-map",
});

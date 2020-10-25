const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const demoPath = "./demos/";
const demoFiles = Object.fromEntries(require("fs")
        .readdirSync(demoPath)
        .map(fileName => [demoPath + fileName.split(".")[0], demoPath + fileName]));


module.exports = {
    entry: demoFiles,
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [{ test: /\.ts$/, loader: "ts-loader" }]
    },
    plugins: Object.keys(demoFiles).map(entryPoint => new HtmlWebpackPlugin({
        title: `c2wasm ${entryPoint}`,
        chunks: [entryPoint],
        filename: `${entryPoint}.html`
    })),
    target: "es2020",
    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    },
    devtool: "source-map",
};
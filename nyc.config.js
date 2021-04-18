module.exports = {
    "temp-dir": "./build/.nyc_output/",
    "report-dir": "./build/coverage/",
    include: [
        "src/**/*.ts"
    ],
    reporter: [
        "text-summary",
        "html"
    ]
}

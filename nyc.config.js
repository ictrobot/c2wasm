module.exports = {
    "temp-dir": "./build/.nyc_output/",
    "report-dir": "./build/coverage/",
    exclude: [
        "tests/**",
        "**/gen/**",
    ],
    reporter: [
        "text-summary",
        "html"
    ]
}

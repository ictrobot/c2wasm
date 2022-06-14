import fs from "fs";
import {join} from "path";

function bundle(folder: string, outputFile: string, simplify: boolean) {
    const contents = (function readFolder(path: string, files: {[name: string]: string}) {
        for (const child of fs.readdirSync(join(folder, path))){
            const childPath = path ? path + '/' + child : child;

            if (fs.statSync(join(folder, childPath)).isDirectory()){
                readFolder(childPath, files);
            } else {
                const readme = child.toLowerCase().includes("readme") || child.toLowerCase().includes("licen");
                const source = child.endsWith(".h") || child.endsWith(".c");
                if (!readme && !source) continue;

                let contents = fs.readFileSync(join(folder, childPath), "utf8")
                    .replace(/\r\n/g, "\n"); // convert CRLF
                if (source && simplify) {
                    contents = contents.replace(/(?:\/\*[^]*?\*\/)|(?:\/\/.*?$)/gm, " ") // remove comments
                        .replace(/^(?:[ \t]*\n+|[ \t]+)/gm, ""); // remove leading whitespace and empty lines
                }

                files[childPath] = contents;
            }
        }
        return files;
    })("", {});

    fs.writeFileSync(outputFile, JSON.stringify(contents));
}

// Standard
const cLib = join(__dirname, '..', 'src', 'c_library');
bundle(join(cLib, 'impl'),  join(cLib, 'standard_library.json'), true);

// Examples
const exampleDir = join(__dirname, '..', 'tests', 'benchmark');
const buildDir = join(__dirname, '..', 'build', 'examples');
fs.mkdirSync(buildDir, {recursive: true});

bundle(join(exampleDir, 'coremark'), join(buildDir, 'CoreMark.json'), false);
bundle(join(exampleDir, 'jpeg', 'src'), join(buildDir, 'libjpeg.json'), false);

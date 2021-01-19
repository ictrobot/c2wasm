export {compile, compileSnippet} from "./compile";
export {getFlags, setFlags} from "./optimization/flags";

// runtime
import {injectArgs, mainWrapper} from "./c_library/runtime/args";
import {Files} from "./c_library/runtime/files";
export const runtime = {injectArgs, mainWrapper, Files};

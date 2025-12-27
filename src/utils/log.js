module.exports = {
    auth: (...msgArgs) => {
        console.log(`[\x1b[34mAUTH\x1b[0m] ${msgArgs.join(" ")}`);
    },
    success: (...msgArgs) => {
        console.log(`[\x1b[32mSUCCESS\x1b[0m] ${msgArgs.join(" ")}`);
    },
    info: (...msgArgs) => {
        console.log(`[\x1b[35mINFO\x1b[0m] ${msgArgs.join(" ")}`);
    },
    warn: (...msgArgs) => {
        console.log(`[\x1b[33mWARN\x1b[0m] ${msgArgs.join(" ")}`);
    },
    error: (type, msg) => {
        console.log(`[\x1b[31m${type.toUpperCase()} ERROR\x1b[0m]`, msg);
    }
}

const log = require("../utils/log");

let self = module.exports = {
    sleep: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    exitProgram: async (seconds) => {
        log.info(`Closing program in ${seconds} seconds...`);
        await self.sleep(seconds * 1000);
        process.exit(0);
    },
    logError: (msg) => {
        console.log(`\x1b[31mERROR\x1b[0m:`, msg);
    }
};

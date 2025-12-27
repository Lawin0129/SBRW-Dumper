const fs = require("fs/promises");

module.exports = {
    safeFileName: (fileName) => {
        return fileName.replace(/[/\\?%*:|"<>]/g, "");
    },
    createDir: async (dir) => {
        await fs.mkdir(dir, { recursive: true });
    },
    saveAndGetMetadata: async (filePath, data) => {
        await fs.writeFile(filePath, data);
        
        return {
            filePath: await fs.realpath(filePath),
            metadata: await fs.stat(filePath)
        };
    }
}

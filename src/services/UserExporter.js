const path = require("path");
const fsExtra = require("../utils/fs");

class UserExporter {
    #saveDirectoryPath;
    #dirReady;
    #persona;
    constructor(serverName, { personaName, personaId }) {
        this.#saveDirectoryPath = path.join(
            process.cwd(),
            "Exported",
            fsExtra.safeFileName(serverName),
            fsExtra.safeFileName(`${personaName} (${personaId})`),
            new Date().toISOString().replace(/:/ig, "-").replace("T", " ").replace("Z", "").split(".")[0]
        );
        this.#persona = { name: personaName, id: personaId };
    }

    get saveDirectoryPath() {
        return this.#saveDirectoryPath;
    }

    get dirReady() {
        return this.#dirReady;
    }

    get persona() {
        return { ...this.#persona };
    }

    async ensureDir() {
        if (this.#dirReady) return;
        await fsExtra.createDir(this.#saveDirectoryPath);
        this.#dirReady = true;
    }

    async #saveXml(fileName, data) {
        await this.ensureDir();
        const filePath = path.join(this.#saveDirectoryPath, `${fileName}.xml`);
        return await fsExtra.saveAndGetMetadata(filePath, data);
    }

    async savePersonaInfo(personaInfoData) {
        return this.#saveXml("GetPersonaInfo", personaInfoData);
    }
    
    async savePersonaBaseInfo(personaBaseInfoData) {
        return this.#saveXml("GetPersonaBase", personaBaseInfoData);
    }
    
    async saveCarslots(carslotsData) {
        return this.#saveXml("carslots", carslotsData);
    }
    
    async saveAchievements(achievementsData) {
        return this.#saveXml("loadall", achievementsData);
    }
    
    async saveInventory(inventoryData) {
        return this.#saveXml("objects", inventoryData);
    }

    async saveTreasureHunt(treasureHuntData) {
        return this.#saveXml("gettreasurehunteventsession", treasureHuntData);
    }
    
    async saveFriendsList(friendsListData) {
        return this.#saveXml("getfriendlistfromuserid", friendsListData);
    }
}

module.exports = UserExporter;
